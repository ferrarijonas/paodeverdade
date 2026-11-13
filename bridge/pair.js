/* Pareamento por QR numa página local (o código de 8 dígitos expira em ~60s).
   Uso: node pair.mjs  ->  abra http://localhost:8099
   Env: PAINEL_SENHA não é usada aqui; a sessão fica em bridge/baileys_auth. */
const http = require('http');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const AUTH_DIR = path.join(__dirname, 'baileys_auth');
const ARQ = path.join(__dirname, 'entrada.json');
let qr = '';
let status = 'abrindo';

const PAGINA = `<!doctype html><meta charset="utf-8"><title>Parear WhatsApp</title>
<body style="font-family:system-ui;text-align:center;padding:24px">
<h2 id="s">abrindo…</h2>
<div id="q"></div>
<p style="color:#666">WhatsApp > Dispositivos conectados > Conectar dispositivo > escaneie</p>
<script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
<script>
let atual = '';
async function tick() {
  const j = await (await fetch('/state')).json();
  document.getElementById('s').textContent = j.status;
  if (j.qr && j.qr !== atual) {
    atual = j.qr;
    const q = document.getElementById('q');
    q.innerHTML = '';
    new QRCode(q, { text: j.qr, width: 320, height: 320, correctLevel: QRCode.CorrectLevel.L });
  }
}
setInterval(tick, 1000); tick();
</script>`;

http.createServer((req, res) => {
  if (req.url.startsWith('/state')) {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ qr, status }));
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(PAGINA);
}).listen(8099, () => console.log('PAGINA: http://localhost:8099'));

(async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Pão de Verdade', 'Chrome', '1.0'],
    markOnlineOnConnect: false,
    syncFullHistory: true
  });
  sock.ev.on('creds.update', saveCreds);
  /* grava o que chega para conferir respostas depois (entrada.json, gitignored) */
  const textoDe = (m) => {
    let msg = m.message || {};
    for (const k of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage']) {
      if (msg[k] && msg[k].message) msg = msg[k].message;
    }
    if (msg.conversation) return msg.conversation;
    if (msg.extendedTextMessage && msg.extendedTextMessage.text) return msg.extendedTextMessage.text;
    for (const k of ['imageMessage', 'videoMessage', 'documentMessage']) {
      if (msg[k] && msg[k].caption) return msg[k].caption;
    }
    return '';
  };
  const tipoDe = (m) => {
    let msg = m.message || {};
    for (const k of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage']) {
      if (msg[k] && msg[k].message) msg = msg[k].message;
    }
    const t = Object.keys(msg).find((k) => k.endsWith('Message'));
    return t || 'desconhecido';
  };
  /* conversa por LID (privacidade nova do WhatsApp): o telefone está no mapeamento local */
  const telefoneDe = (m) => {
    const jid = m.key.remoteJid || '';
    const alt = m.key.remoteJidAlt || '';
    if (jid.endsWith('@s.whatsapp.net')) return jid.split('@')[0];
    if (alt.endsWith('@s.whatsapp.net')) return alt.split('@')[0];
    if (jid.endsWith('@lid')) {
      const f = path.join(AUTH_DIR, 'lid-mapping-' + jid.split('@')[0] + '_reverse.json');
      try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return ''; }
    }
    return '';
  };
  const gravar = (m) => {
    if (!m || !m.message || !m.key || m.key.fromMe) return;
    const texto = String(textoDe(m)).trim();
    const tel = telefoneDe(m);
    if (!texto && !tel) return;
    fs.appendFileSync(ARQ, JSON.stringify({
      quando: new Date((m.messageTimestamp || 0) * 1000).toISOString(),
      jid: tel,
      lid: (m.key.remoteJid || '').endsWith('@lid') ? (m.key.remoteJid || '').split('@')[0] : '',
      tipo: tipoDe(m),
      texto
    }) + '\n');
  };
  sock.ev.on('messages.upsert', (u) => { for (const m of u.messages || []) gravar(m); });
  sock.ev.on('messaging-history.set', (h) => {
    for (const m of h.messages || []) gravar(m);
    console.log('HISTORICO ' + (h.messages || []).length);
  });
  sock.ev.on('connection.update', (u) => {
    if (u.qr) { qr = u.qr; status = 'aguardando leitura'; }
    if (u.connection === 'open') { qr = ''; status = 'CONECTADO'; console.log('CONECTADO'); }
    if (u.connection === 'close') {
      const code = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output
        ? u.lastDisconnect.error.output.statusCode : null;
      if (code === DisconnectReason.loggedOut) {
        status = 'sessão encerrada (logout)';
        console.log('SESSAO_ENCERRADA');
        process.exit(1);
      }
      status = 'reconectando (' + (code || '?') + ')';
      console.log('DESCONECTOU:' + (code || '?') + ' -> reconectando');
      setTimeout(conectar, 2000);
    }
  });
})();
