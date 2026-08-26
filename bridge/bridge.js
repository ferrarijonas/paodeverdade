/* Ponte WhatsApp (Baileys) — Pão de Verdade.
   Roda num servidor Node separado (VPS/Render/Railway ou na sua máquina).
   Setup:
     1) cd bridge && npm install
     2) defina a variavel de ambiente BRIDGE_TOKEN (senha compartilhada com o Apps Script)
     3) node bridge.js  -> escaneie o QR code com o WhatsApp que vai enviar
     4) No Apps Script (Script Properties): WHATSAPP_BRIDGE_URL = "https://SEU_HOST/send" e BRIDGE_TOKEN igual.
   O Apps Script faz POST /send com { token, to, message }. */
const http = require('http');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');

const PORT = process.env.PORT || 8080;
const TOKEN = process.env.BRIDGE_TOKEN || '';

let sock = null;

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({ version, auth: state, printQRInTerminal: true });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (u) => {
    if (u.qr) qrcode.generate(u.qr, { small: true });
    if (u.connection === 'close') {
      const reason = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output && u.lastDisconnect.error.output.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log('Sessão encerrada no celular. Rode de novo e escaneie o QR.');
        sock = null;
      } else {
        console.log('Reconectando…');
        conectar();
      }
    } else if (u.connection === 'open') {
      console.log('WhatsApp conectado.');
    }
  });
}

function enviar(to, message) {
  return new Promise((resolve, reject) => {
    if (!sock) return reject(new Error('ponte desconectada'));
    const jid = String(to).replace(/\D/g, '') + '@s.whatsapp.net';
    sock.sendMessage(jid, { text: message }).then(resolve).catch(reject);
  });
}

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  if (req.method !== 'POST' || (req.url || '').split('?')[0] !== '/send') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, erro: 'not found' }));
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try {
      const data = JSON.parse(body || '{}');
      if (!TOKEN || data.token !== TOKEN) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, erro: 'token invalido' }));
      }
      if (!data.to || !data.message) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, erro: 'faltam to/message' }));
      }
      enviar(data.to, data.message).then(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      }).catch((e) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, erro: String((e && e.message) || e) }));
      });
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, erro: 'json invalido' }));
    }
  });
}).listen(PORT, () => {
  console.log('Ponte WhatsApp escutando na porta ' + PORT);
  conectar();
});