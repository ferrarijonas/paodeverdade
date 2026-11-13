/* Envia WhatsApp pela ponte local (Baileys) puxando a fila do backend.
   Uso:
     node zap-sender.js connect --numero 5534936186847
     node zap-sender.js fila  --campanha turma1411 --publico espera --dry-run
     node zap-sender.js send  --campanha turma1411 --publico espera --limite 50
   Env: PAINEL_SENHA (obrigatória), WEB_APP_URL (opcional).
   Sessão: bridge/baileys_auth (não commitar). */
const path = require('path');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const M = require('./mensagens');

const BRANCO = 'https://script.google.com/macros/s/AKfycbxHyN1-ZU49ZH4wU92MHw8PlgLayxVSiszJ7iGG47jdampR5CrTDK2hmo4OH0koPaKRtQ/exec';
const BASE = process.env.WEB_APP_URL || BRANCO;
const SENHA = process.env.PAINEL_SENHA || '';
const AUTH_DIR = path.join(__dirname, 'baileys_auth');

const args = process.argv.slice(2);
const modo = args[0] || 'connect';
function opt(nome, padrao) {
  const i = args.indexOf('--' + nome);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : padrao;
}
const flag = (nome) => args.includes('--' + nome);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const url = BASE + '?' + new URLSearchParams({ ...params, senha: SENHA }).toString();
  const res = await fetch(url, { redirect: 'follow' });
  const txt = await res.text();
  return JSON.parse(txt);
}

async function abrir({ numero, onOpen }) {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Pão de Verdade', 'Chrome', '1.0'],
    markOnlineOnConnect: false
  });
  sock.ev.on('creds.update', saveCreds);

  if (!sock.authState.creds.registered && numero) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(numero);
        console.log('CODIGO:' + code);
      } catch (e) {
        console.log('ERRO_PAREAMENTO:' + (e && e.message));
      }
    }, 3000);
  }

  sock.ev.on('connection.update', async (u) => {
    if (u.qr) {
      console.log('QR_DISPONIVEL');
      require('qrcode-terminal').generate(u.qr, { small: true });
    }
    if (u.connection === 'open') {
      console.log('CONECTADO');
      if (onOpen) {
        try {
          await onOpen(sock);
        } catch (e) {
          console.log('ERRO_ENVIO:' + (e && e.message));
          process.exit(1);
        }
      }
    }
  });

  sock.ev.on('connection.update', (u) => {
    if (u.connection !== 'close') return;
    const code = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output
      ? u.lastDisconnect.error.output.statusCode : null;
    if (code === DisconnectReason.loggedOut) {
      console.log('SESSAO_ENCERRADA');
      process.exit(1);
    }
    console.log('DESCONECTOU:' + (code || '?'));
  });

  return sock;
}

function montarMensagem(contato) {
  const tpl = M.TEXTOS[contato.publico] || M.TEXTOS['espera'];
  /* só o primeiro nome — "Oi, Leandro!" e não "Oi, Leandro Lamounier!" */
  const nome = String(contato.nome || '').trim().split(/\s+/)[0];
  const saudacao = !nome || /@|\d/.test(nome) ? 'Oi!' : 'Oi, ' + nome + '!';
  return tpl
    .replace(/\{saudacao\}/g, saudacao)
    .replace(/\{nome\}/g, nome)
    .replace(/\{linkPao\}/g, M.LINKS.pao)
    .replace(/\{linkMassas\}/g, M.LINKS.massas);
}

async function main() {
  if (!SENHA) {
    console.error('Defina PAINEL_SENHA no ambiente.');
    process.exit(1);
  }

  if (modo === 'connect') {
    const numero = opt('numero', '');
    console.log('Abrindo sessão...');
    await abrir({
      numero,
      onOpen: async () => {
        console.log('PAREADO');
        await sleep(1500);
        process.exit(0);
      }
    });
    return;
  }

  if (modo === 'teste') {
    const para = String(opt('para', '')).replace(/\D/g, '');
    if (para.length < 12) {
      console.error('Informe --para com DDI+DDD+numero.');
      process.exit(1);
    }
    const texto = montarMensagem({ publico: opt('publico', 'espera'), nome: opt('nome', 'Jonas') });
    console.log('--- mensagem ---\n' + texto + '\n----------------');
    await abrir({
      numero: '',
      onOpen: async (sock) => {
        const existe = await sock.onWhatsApp(para + '@s.whatsapp.net');
        if (!existe || !existe[0] || !existe[0].exists) {
          console.error('SEM_WHATSAPP ' + para);
          process.exit(1);
        }
        const r = await sock.sendMessage(existe[0].jid, { text: texto });
        console.log('TESTE_ENVIADO ' + para + ' jid=' + existe[0].jid + ' id=' + r.key.id);
        await sleep(1500);
        process.exit(0);
      }
    });
    return;
  }

  const campanha = opt('campanha', 'turma1411');
  const publico = opt('publico', 'ambos');
  const limite = opt('limite', '50');

  const fila = await api({ acao: 'zapfila', campanha, publico, limite });
  if (!fila.ok) {
    console.error('Fila: ' + fila.erro);
    process.exit(1);
  }
  console.log('campanha=' + campanha + ' publico=' + publico +
    ' total=' + fila.total + ' jaEnviados=' + fila.jaEnviados + ' pendentes=' + fila.pendentes);

  if (modo === 'fila' || flag('dry-run')) {
    console.log(JSON.stringify(fila.fila, null, 2));
    return;
  }

  if (!fila.fila.length) {
    console.log('Nada pendente.');
    return;
  }

  const minS = Math.max(5, parseInt(opt('delay-min', '25'), 10) || 25);
  const maxS = Math.max(minS, parseInt(opt('delay-max', '45'), 10) || 45);

  await abrir({
    numero: opt('numero', ''),
    onOpen: async (sock) => {
      let enviados = 0;
      let falhas = 0;
      for (let i = 0; i < fila.fila.length; i++) {
        const c = fila.fila[i];
        try {
          const existe = await sock.onWhatsApp(c.telefone + '@s.whatsapp.net');
          if (!existe || !existe[0] || !existe[0].exists) {
            await api({ acao: 'zapmarcar', campanha, telefone: c.telefone, nome: c.nome, publico: c.publico, status: 'erro:sem whatsapp' });
            falhas++;
            console.log('SEM_WHATSAPP ' + c.telefone + ' (' + c.nome + ')');
            continue;
          }
          /* usa o JID que o WhatsApp devolve: o número gravado na planilha pode ter
             (ou faltar) o 9 do celular, e o JID é que identifica a conta */
          const jid = existe[0].jid;
          await sock.sendPresenceUpdate('composing', jid);
          await sleep(1200 + Math.random() * 1800);
          await sock.sendMessage(jid, { text: montarMensagem(c) });
          await sock.sendPresenceUpdate('paused', jid);
          await api({ acao: 'zapmarcar', campanha, telefone: c.telefone, nome: c.nome, publico: c.publico, status: 'enviado' });
          enviados++;
          console.log('OK ' + c.telefone + ' (' + c.nome + ') ' + (i + 1) + '/' + fila.fila.length);
        } catch (e) {
          falhas++;
          const msg = String((e && e.message) || e).slice(0, 120);
          await api({ acao: 'zapmarcar', campanha, telefone: c.telefone, nome: c.nome, publico: c.publico, status: 'erro:' + msg });
          console.log('ERRO ' + c.telefone + ' ' + msg);
        }
        if (i < fila.fila.length - 1) {
          const espera = (minS + Math.random() * (maxS - minS)) * 1000;
          console.log('aguardando ' + Math.round(espera / 1000) + 's');
          await sleep(espera);
        }
      }
      console.log('FIM enviados=' + enviados + ' falhas=' + falhas);
      await sleep(1500);
      process.exit(0);
    }
  });
}

main().catch((e) => {
  console.error('FALHA: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
