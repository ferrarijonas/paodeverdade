/* analytics.js — Pão de Verdade — rastreador leve (sem cookies, sem terceiros)
   Eventos: view · time (tempo na página) · scroll (profundidade 25/50/75/90)
   Expõe window.PDV_Track(evento, valor) para páginas (ex.: checkout -> click_pagar) */
(function () {
  var API = (typeof PDV_CONFIG !== 'undefined' && PDV_CONFIG.WEB_APP_URL) || '';
  if (!API) return;
  var PAGINA = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '') || 'index';
  var inicio = Date.now();
  var enviadosScroll = {};
  var sid = '';
  try {
    sid = sessionStorage.getItem('pdv_sid');
    if (!sid) {
      sid = 'S' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      sessionStorage.setItem('pdv_sid', sid);
    }
  } catch (e) {}

  function track(evento, valor) {
    try {
      /* keepalive: o evento precisa sobreviver ao fechamento da aba */
      fetch(API + '?acao=analitica' +
        '&evento=' + encodeURIComponent(evento) +
        '&pagina=' + encodeURIComponent(PAGINA) +
        '&sessao=' + encodeURIComponent(sid) +
        '&valor=' + encodeURIComponent(String(valor == null ? '' : valor)) +
        '&_=' + Date.now(), { cache: 'no-store', keepalive: true }).catch(function () {});
    } catch (e2) {}
  }

  function enviarTempo() {
    var seg = Math.round((Date.now() - inicio) / 1000);
    if (seg >= 3) track('time', seg);
  }

  track('view', '');

  /* primeiro contato da sessão: origem e aparelho, uma vez só */
  (function primeiroContato() {
    try { if (sessionStorage.getItem('pdv_origem')) return; } catch (e) { return; }
    var p = new URLSearchParams(location.search);
    var utm = [p.get('utm_source'), p.get('utm_medium'), p.get('utm_campaign')].filter(Boolean).join('/');
    var ref = '';
    try {
      if (document.referrer) {
        var u = new URL(document.referrer);
        if (u.host && u.host !== location.host) ref = u.host;
      }
    } catch (e2) {}
    track('origem', utm || ref || 'direto');
    track('dispositivo', /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop');
    try { sessionStorage.setItem('pdv_origem', '1'); } catch (e3) {}
  })();

  window.addEventListener('scroll', function () {
    var doc = document.documentElement;
    var max = Math.max(doc.scrollHeight, document.body.scrollHeight) - window.innerHeight;
    if (max <= 0) return;
    var pct = Math.round((window.scrollY || doc.scrollTop) / max * 100);
    [25, 50, 75, 90].forEach(function (m) {
      if (pct >= m && !enviadosScroll[m]) { enviadosScroll[m] = true; track('scroll', m); }
    });
  }, { passive: true });

  setTimeout(enviarTempo, 30000);
  setTimeout(enviarTempo, 60000);
  setTimeout(enviarTempo, 120000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') enviarTempo();
  });
  window.addEventListener('pagehide', function () { enviarTempo(); });

  window.PDV_Track = function (evento, valor) { track(evento, valor); };

  /* erro de JS do visitante não aparece em lugar nenhum do servidor. Vai para a
     aba Logs como `erro_js` — aparece em ?acao=diagnostico e ?acao=logs.
     Um registro por erro por página, para não inundar. */
  var vistos = {};
  function logErro(chave, texto) {
    if (vistos[chave]) return;
    vistos[chave] = true;
    try {
      fetch(API + '?acao=log&tipo=erro_js&detalhe=' + encodeURIComponent(PAGINA + ' | ' + texto) + '&_=' + Date.now(),
        { cache: 'no-store', keepalive: true }).catch(function () {});
    } catch (e) {}
  }
  window.addEventListener('error', function (e) {
    if (!e || !e.message) return;
    var arq = String(e.filename || '').split('/').pop() || '?';
    logErro('e' + e.message + arq + e.lineno, String(e.message).slice(0, 120) + ' | ' + arq + ':' + (e.lineno || 0));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var m = e && e.reason && (e.reason.message || e.reason);
    logErro('p' + m, 'promessa: ' + String(m || 'sem mensagem').slice(0, 120));
  });
})();
