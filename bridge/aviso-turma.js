/* Aviso de uma turma (só quem pagou) pelo WhatsApp da ponte Baileys.
   Uso:
     node aviso-turma.js --curso "Massas Doces" --data 14/11/2026 --texto aviso.txt --dry-run
     node aviso-turma.js --curso "Massas Doces" --data 14/11/2026 --texto aviso.txt --pdf ..\apostila.pdf --parar-ponte
   O texto aceita {nome}, que vira o primeiro nome de cada aluno.
   Env: PAINEL_SENHA vem de ..\config.local.json quando nao esta no ambiente. */
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');

const RAIZ = path.join(__dirname, '..');
const BASE = process.env.WEB_APP_URL ||
  'https://script.google.com/macros/s/AKfycbxHyN1-ZU49ZH4wU92MHw8PlgLayxVSiszJ7iGG47jdampR5CrTDK2hmo4OH0koPaKRtQ/exec';
const SENHA = process.env.PAINEL_SENHA ||
  JSON.parse(fs.readFileSync(path.join(RAIZ, 'config.local.json'), 'utf8')).PAINEL_SENHA;

const args = process.argv.slice(2);
const opt = (nome, padrao) => {
  const i = args.indexOf('--' + nome);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : padrao;
};
const flag = (nome) => args.includes('--' + nome);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const cursoAlvo = opt('curso', '');
const dataAlvo = opt('data', '');
const pdf = opt('pdf', '');
const para = opt('para', '');
const textoArg = opt('texto', '');

if (!dataAlvo || !textoArg) {
  console.log('Informe --data e --texto. Ex.: --curso "Pão" --data 14/11/2026 --texto aviso.txt');
  process.exit(1);
}

const texto = fs.existsSync(textoArg) ? fs.readFileSync(textoArg, 'utf8').trim() : textoArg;
const campanha = opt('campanha', 'aviso-' + dataAlvo.replace(/\//g, '') + '-' + (cursoAlvo || 'todos').toLowerCase().normalize('NFD').replace(/[^a-z]/g, ''));
const LOG = path.join(__dirname, 'enviados-' + campanha + '.json');

const normCurso = (v) => {
  const s = String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (s.includes('pizza')) return 'pizza';
  if (s.includes('massa')) return 'massas';
  if (s.includes('pao')) return 'pao';
  return s.trim();
};
const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || '';

async function api(params) {
  const res = await fetch(BASE + '?' + new URLSearchParams({ ...params, senha: SENHA }), { redirect: 'follow' });
  return res.json();
}

function pidsDaPonte() {
  const cmd = "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*pair.js*' } | ForEach-Object { $_.ProcessId }";
  const r = spawnSync('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' });
  return String(r.stdout || '').split(/\s+/).filter(Boolean).map(Number);
}

function pararPonte() {
  const pids = pidsDaPonte();
  pids.forEach((pid) => spawnSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore' }));
  return pids.length;
}

function religarPonte() {
  spawn('cmd', ['/c', 'node pair.js >> pair.log 2>&1'], { cwd: __dirname, detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

(async () => {
  let publico = [];
  if (para) {
    publico = [{ nome: opt('nome', 'Teste'), telefone: para.replace(/\D/g, '') }];
  } else {
    const dados = await api({ acao: 'dados' });
    if (!dados || !dados.inscritos) throw new Error('nao consegui ler ?acao=dados');
    const vistos = new Set();
    dados.inscritos.forEach((i) => {
      if (String(i.status || '').trim() !== 'pago') return;
      if (String(i.dataTurma || '').trim() !== dataAlvo) return;
      if (cursoAlvo && normCurso(i.curso) !== normCurso(cursoAlvo)) return;
      let tel = String(i.whatsapp || '').replace(/\D/g, '');
      if (tel.length === 10 || tel.length === 11) tel = '55' + tel;
      if (tel.length < 12 || vistos.has(tel)) return;
      vistos.add(tel);
      publico.push({ nome: String(i.nome || '').trim(), telefone: tel });
    });
  }

  console.log('campanha=' + campanha + ' | turma=' + (cursoAlvo || 'todos') + ' ' + dataAlvo + ' | pagos=' + publico.length);
  publico.forEach((p) => console.log('  - ' + p.nome + ' ' + p.telefone));
  if (!publico.length) { console.log('Ninguem para avisar.'); return; }
  if (flag('dry-run')) { console.log('--- texto ---\n' + texto.replace(/\{nome\}/g, primeiroNome(publico[0].nome))); return; }

  const feitos = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : {};
  const pendentes = publico.filter((p) => !feitos[p.telefone]);
  if (!pendentes.length) { console.log('Todos ja receberam nesta campanha.'); return; }

  let parou = false;
  if (pidsDaPonte().length) {
    if (!flag('parar-ponte')) {
      console.log('O pair.js esta rodando e segura a sessao. Rode de novo com --parar-ponte (o script religa no fim).');
      process.exit(1);
    }
    console.log('parando a ponte (' + pararPonte() + ' processo)');
    parou = true;
    await dormir(3000);
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'baileys_auth'));
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({ version, auth: state, logger: pino({ level: 'silent' }), markOnlineOnConnect: false });
    sock.ev.on('creds.update', saveCreds);

    await new Promise((ok, falha) => {
      sock.ev.on('connection.update', (u) => {
        if (u.connection === 'open') ok();
        if (u.connection === 'close') falha(new Error('conexao fechada: ' + JSON.stringify(u.lastDisconnect || {})));
      });
      setTimeout(() => falha(new Error('timeout na conexao')), 60000);
    });
    console.log('conectado como ' + (sock.user && sock.user.id));

    for (const p of pendentes) {
      const [info] = await sock.onWhatsApp(p.telefone + '@s.whatsapp.net');
      if (!info || !info.exists) { console.log('SEM WHATSAPP ' + p.nome + ' ' + p.telefone); continue; }

      const conteudo = pdf
        ? {
            document: fs.readFileSync(pdf),
            mimetype: 'application/pdf',
            fileName: path.basename(pdf),
            caption: texto.replace(/\{nome\}/g, primeiroNome(p.nome))
          }
        : { text: texto.replace(/\{nome\}/g, primeiroNome(p.nome)) };

      await sock.sendPresenceUpdate('composing', info.jid);
      await dormir(1200 + Math.random() * 1200);
      await sock.sendMessage(info.jid, conteudo);
      await sock.sendPresenceUpdate('paused', info.jid);

      feitos[p.telefone] = new Date().toISOString();
      fs.writeFileSync(LOG, JSON.stringify(feitos, null, 2));
      await api({ acao: 'zapmarcar', campanha, telefone: p.telefone, nome: p.nome, status: 'enviado', publico: 'alunos:' + dataAlvo + ':' + normCurso(cursoAlvo) });
      console.log('ENVIADO ' + p.nome);
      await dormir(5000 + Math.random() * 4000);
    }
  } finally {
    if (parou) religarPonte();
  }
  await dormir(1500);
  process.exit(0);
})().catch((e) => { console.error('ERRO ' + e.message); process.exit(1); });
