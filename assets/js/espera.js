/* Lista de espera unificada (PdvEspera) — um programa só, por curso (Pão/Pizza/Ambos), sem data.
   Uso:
     PdvEspera.montar({ container: '#x', cursos: ['Pão','Pizza'], selecionado: 'Pão', botao: 'Avisar quando abrir' });
     PdvEspera.link({ container: '#x', cursos: ['Pão','Pizza'], selecionado: 'Pão' }); */
(function () {
  'use strict';
  var API = (typeof PDV_CONFIG !== 'undefined' && PDV_CONFIG.WEB_APP_URL) || '';

  if (!document.getElementById('pdvEsperaCss')) {
    var st = document.createElement('style');
    st.id = 'pdvEsperaCss';
    st.textContent = '.e-form{margin-top:8px;padding:12px;border:1px solid #E2DED7;border-radius:10px;background:#FCFBF9;font-size:.85rem}' +
      '.e-titulo{display:block;color:#4A2E1B;font-weight:700}' +
      '.e-texto{color:#6E6A64;margin:6px 0}' +
      '.e-form .e-label{display:block;font-size:.8rem;font-weight:700;color:#4A2E1B;margin-top:6px}' +
      '.e-form select.e-curso,.e-form input{width:100%;margin-top:4px;padding:8px 10px;border:1px solid #E2DED7;border-radius:8px;font-size:.85rem;box-sizing:border-box;background:#fff}' +
      '.e-campos{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}' +
      '.e-campos input{flex:1 1 130px;min-width:0}' +
      '.e-btn{padding:8px 16px;border:none;border-radius:999px;background:#212121;color:#fff;font-weight:700;cursor:pointer}' +
      '.e-btn:disabled{opacity:.6;cursor:default}' +
      '.e-msg{margin-top:6px;font-size:.82rem}';
    document.head.appendChild(st);
  }

  function qs(s, el) { return (el || document).querySelector(s); }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function jsonp(params, cb) {
    if (!API) return cb(null);
    var id = 'pdvEspera' + Math.floor(Math.random() * 1e8);
    var done = false;
    window[id] = function (res) { done = true; delete window[id]; cb(res); };
    var s = document.createElement('script');
    s.onerror = function () { if (!done) { done = true; delete window[id]; cb(null); } };
    setTimeout(function () { if (!done) { done = true; delete window[id]; cb(null); } }, 15000);
    s.src = API + '?' + params + '&callback=' + id;
    document.body.appendChild(s);
  }

  function opcoes(cursos, selecionado) {
    var opt = [];
    cursos.forEach(function (c) {
      opt.push('<option value="' + esc(c) + '"' + (c === selecionado ? ' selected' : '') + '>' + esc(c) + '</option>');
    });
    if (cursos.length > 1) {
      opt.push('<option value="' + esc(cursos[0]) + ',' + esc(cursos[1]) + '"' +
        (selecionado === cursos[0] + ',' + cursos[1] ? ' selected' : '') + '>Ambos</option>');
    }
    return opt.join('');
  }

  function html(box) {
    var cursos = box._cursos;
    var sel = cursos.length > 1
      ? '<label class="e-label">Curso<select class="e-curso">' + opcoes(cursos, box._selecionado) + '</select></label>'
      : '<input type="hidden" class="e-curso" value="' + esc(cursos[0] || '') + '">';
    return '<div class="e-form">' +
      (box._titulo ? '<b class="e-titulo">' + esc(box._titulo) + '</b>' : '') +
      (box._texto ? '<p class="e-texto">' + esc(box._texto) + '</p>' : '') +
      sel +
      '<div class="e-campos">' +
      '<input class="e-nome" placeholder="Seu nome" autocomplete="name">' +
      '<input class="e-whats" placeholder="WhatsApp com DDD" inputmode="tel" autocomplete="tel">' +
      '<input class="e-email" placeholder="E-mail" type="email" autocomplete="email">' +
      '<button type="button" class="e-btn">' + esc(box._botao || 'Entrar na lista de espera') + '</button>' +
      '</div><div class="e-msg"></div></div>';
  }

  function enviar(box) {
    var cursos = String(qs('.e-curso', box).value || '').split(',').filter(Boolean);
    var nome = qs('.e-nome', box).value.trim();
    var whats = qs('.e-whats', box).value.trim().replace(/\D/g, '');
    var email = qs('.e-email', box).value.trim();
    var msg = qs('.e-msg', box);
    if (!nome) { msg.textContent = 'Informe seu nome.'; msg.style.color = '#C62828'; return; }
    if (whats.length < 10 && !email) { msg.textContent = 'Informe WhatsApp ou e-mail.'; msg.style.color = '#C62828'; return; }
    msg.textContent = 'Enviando…'; msg.style.color = '';
    jsonp('acao=listaespera&cursos=' + encodeURIComponent(cursos.join(',')) +
      '&nome=' + encodeURIComponent(nome) +
      '&whatsapp=' + encodeURIComponent(whats) +
      '&email=' + encodeURIComponent(email), function (res) {
      msg.textContent = res && res.ok ? 'Você entrou na lista! Avisamos quando abrir vaga. 💛' : ((res && res.erro) || 'Não foi possível agora. Tente de novo.');
      msg.style.color = res && res.ok ? '#2E7D32' : '#C62828';
      if (res && res.ok) { var b = qs('.e-btn', box); if (b) b.disabled = true; }
    });
  }

  function montar(opts) {
    var box = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
    if (!box) return;
    box._cursos = (opts.cursos && opts.cursos.length) ? opts.cursos : ['Pão', 'Pizza'];
    box._selecionado = opts.selecionado || '';
    box._titulo = opts.titulo || '';
    box._texto = opts.texto || '';
    box._botao = opts.botao || '';
    box.hidden = false;
    box.innerHTML = html(box);
    var btn = qs('.e-btn', box);
    if (btn) btn.addEventListener('click', function () { enviar(box); });
  }

  function link(opts) {
    var box = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
    if (!box) return;
    var a = document.createElement('a');
    a.href = 'javascript:void(0)';
    a.textContent = opts.texto || 'Entrar na lista de espera';
    a.style.cssText = 'display:inline-block;margin-top:8px;font-size:.85rem;font-weight:700;text-decoration:underline;color:#4A2E1B;cursor:pointer';
    a.addEventListener('click', function () {
      if (box._montado) { box.hidden = !box.hidden; return; }
      box._montado = true;
      montar(opts);
    });
    box.appendChild(a);
  }

  window.PdvEspera = { montar: montar, link: link };
})();
