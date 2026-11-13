/* Diagnóstico de entrega: confere se o número tem WhatsApp e espera o recibo.
   Uso: node diag.js 5534999277591 */
const path = require('path');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const AUTH_DIR = path.join(__dirname, 'baileys_auth');
const alvo = String(process.argv[2] || '').replace(/\D/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (alvo.length < 12) { console.error('Informe o número com DDI.'); process.exit(1); }
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version, auth: state, logger: pino({ level: 'silent' }),
    browser: ['Pão de Verdade', 'Chrome', '1.0'], markOnlineOnConnect: false
  });
  sock.ev.on('creds.update', saveCreds);

  const jid = alvo + '@s.whatsapp.net';
  const recibos = {};
  sock.ev.on('messages.update', (lote) => {
    for (const m of lote) {
      if (m.key && m.key.id) recibos[m.key.id] = m.update && m.update.status;
    }
  });

  sock.ev.on('connection.update', async (u) => {
    if (u.connection !== 'open') return;
    try {
      const existe = await sock.onWhatsApp(jid);
      console.log('EXISTE ' + JSON.stringify(existe));
      if (!existe || !existe[0] || !existe[0].exists) { process.exit(0); }
      const r = await sock.sendMessage(jid, { text: 'Teste de entrega ' + new Date().toISOString() });
      console.log('ENVIADO id=' + r.key.id + ' statusInicial=' + r.status);
      for (let i = 0; i < 15; i++) {
        await sleep(1000);
        const st = recibos[r.key.id];
        if (st !== undefined) console.log('RECIBO ' + st + ' apos ' + (i + 1) + 's');
        if (st >= 3) break;
      }
      console.log('FINAL ' + JSON.stringify(recibos));
      await sleep(1000);
      process.exit(0);
    } catch (e) {
      console.log('ERRO_ENVIO ' + (e && e.message));
      process.exit(1);
    }
  });
})();
