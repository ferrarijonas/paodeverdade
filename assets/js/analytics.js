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
      var s = document.createElement('script');
      s.src = API + '?acao=analitica' +
        '&evento=' + encodeURIComponent(evento) +
        '&pagina=' + encodeURIComponent(PAGINA) +
        '&sessao=' + encodeURIComponent(sid) +
        '&valor=' + encodeURIComponent(String(valor == null ? '' : valor));
      document.body.appendChild(s);
      setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 5000);
    } catch (e2) {}
  }

  function enviarTempo() {
    var seg = Math.round((Date.now() - inicio) / 1000);
    if (seg >= 3) track('time', seg);
  }

  track('view', '');

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
})();
