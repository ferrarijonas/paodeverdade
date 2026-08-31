/* proximas.js — Pão de Verdade — próxima turma real, direto da planilha.
   Busca ?acao=proximas (turmas futuras com ocupação + flag 'ativa') e
   renderiza: hero da home, páginas de curso e agenda. Fonte única para
   datas — nada de data fixa no HTML. */
(function () {
  'use strict';

  var API = (typeof PDV_CONFIG !== 'undefined' && PDV_CONFIG.WEB_APP_URL) || '';
  var CURSOS = {
    'Pão': { hora: '8h às 13h', slug: 'curso-pao.html', cls: 'pao' },
    'Pizza': { hora: '17h às 22h', slug: 'curso-pizza.html', cls: 'pizza' }
  };
  var NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  var NOMES_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  var turmas = null;

  /* --- cache de sessao (mesmo padrao do lotada.js): primeira pagina da
     sessao busca; as seguintes usam o cache. TTL curto p/ nao mostrar
     "em breve" velho quando uma turma for reaberta. --- */
  var CACHE_KEY = 'pdv_proximas';
  var CACHE_TTL = 5 * 60 * 1000;

  function cacheLer() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || typeof o.em !== 'number' || Date.now() - o.em > CACHE_TTL) return null;
      return Array.isArray(o.dados) ? o.dados : null;
    } catch (eC) { return null; }
  }

  function cacheGravar(lista) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ em: Date.now(), dados: lista }));
    } catch (eG) {}
  }

  function qs(s, el) { return (el || document).querySelector(s); }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function norm(s) {
    return String(s || '').trim().toLowerCase()
      .replace(/[àáâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
      .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c');
  }

  function param(k) {
    try { return new URLSearchParams(location.search).get(k) || ''; } catch (eP) { return ''; }
  }

  function parseBR(s) {
    var p = String(s).split('/');
    return new Date(+p[2], +p[1] - 1, +p[0]);
  }

  function dataLabel(data) {
    return NOMES_DIA[parseBR(data).getDay()] + ', ' + data;
  }

  function horaDe(curso) { return CURSOS[curso] ? CURSOS[curso].hora : ''; }

  function enc(v) { return encodeURIComponent(v); }

  function jsonp(params, cb) {
    if (!API) return cb(null);
    var id = 'pdvProximas' + Math.floor(Math.random() * 1e8);
    var done = false;
    window[id] = function (res) { done = true; delete window[id]; cb(res); };
    var s = document.createElement('script');
    s.onerror = function () { if (!done) { done = true; delete window[id]; cb(null); } };
    setTimeout(function () { if (!done) { done = true; delete window[id]; cb(null); } }, 15000);
    s.src = API + '?' + params + '&callback=' + id;
    document.body.appendChild(s);
  }

  function buscar(cb) {
    if (turmas) return cb(turmas);
    var c = cacheLer();
    if (c) { turmas = c; cb(turmas); return; }
    jsonp('acao=proximas', function (res) {
      turmas = Array.isArray(res) ? res : null;
      if (turmas) cacheGravar(turmas);
      cb(turmas);
    });
  }

  function proximaDe(curso) {
    if (!Array.isArray(turmas)) return null;
    for (var i = 0; i < turmas.length; i++) {
      if (norm(turmas[i].curso) === norm(curso)) return turmas[i];
    }
    return null;
  }

  function turmaDe(curso, data) {
    if (!Array.isArray(turmas)) return null;
    for (var i = 0; i < turmas.length; i++) {
      if (norm(turmas[i].curso) === norm(curso) && String(turmas[i].dataTurma) === String(data)) return turmas[i];
    }
    return null;
  }

  /* ---- HOME ---- */
  function renderHome() {
    var box = qs('#heroTurma');
    if (!box) return;
    var date = qs('.hero-date', box);
    var btns = qs('.btn-group', box);
    if (!turmas || !turmas.length) {
      if (date) date.innerHTML = '<span class="date-head">📅 Próxima turma</span><br>Em breve — entre na lista de espera e avisamos quando abrir.';
      if (btns) btns.innerHTML = '<a class="btn btn-primary btn-lg" href="javascript:void(0)" data-espera-abrir>Entrar na lista de espera</a>';
      return;
    }
    var data = turmas[0].dataTurma;
    var destaData = turmas.filter(function (t) { return String(t.dataTurma) === String(data); });
    if (date) {
      date.innerHTML = '<span class="date-head">📅 Turma de ' + data.slice(0, 5) + '</span><br>' +
        destaData.map(function (t) { return esc(t.curso) + ' · ' + horaDe(t.curso); }).join('<br>');
    }
    if (btns) {
      btns.innerHTML = destaData.map(function (t, i) {
        var prim = i === 0 ? 'btn-primary' : 'btn-outline';
        if (t.ativa && Number(t.restantes) > 0) {
          return '<a class="btn ' + prim + ' btn-lg" href="checkout.html?curso=' + enc(t.curso) + '&data=' + enc(t.dataTurma) + '">Garantir vaga no ' + esc(t.curso) + '</a>';
        }
        var rotulo = t.ativa ? 'Turma lotada — entrar na lista de espera' : 'Em breve — entrar na lista de espera';
        return '<a class="btn ' + prim + ' btn-lg" href="javascript:void(0)" data-espera-abrir>' + rotulo + '</a>';
      }).join('');
    }
  }

  /* ---- PÁGINAS DE CURSO ---- */
  function renderCurso(curso) {
    var elData = qs('#courseData');
    var cta = qs('#ctaComprar');
    var faq = qs('#faqData');
    var vagasEl = qs('#cursoVagas');
    if (!elData && !cta && !faq && !vagasEl) return;

    var qData = param('data');
    var t = null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(qData)) t = turmaDe(curso, qData);

    var elDataTexto = t ? (dataLabel(t.dataTurma) + ' · ' + horaDe(curso)) : 'nova turma em breve';
    if (elData) elData.textContent = elDataTexto;

    if (cta) {
      if (t && t.ativa && Number(t.restantes) > 0) {
        cta.setAttribute('href', 'checkout.html?curso=' + enc(curso) + '&data=' + enc(t.dataTurma));
        cta.textContent = 'Garantir minha vaga — R$275';
        cta.removeAttribute('data-espera-abrir');
      } else {
        cta.removeAttribute('href');
        cta.setAttribute('data-espera-abrir', '');
        cta.textContent = t && t.ativa && t.cheia ? 'TURMA LOTADA — entrar na lista de espera' : 'Em breve — avisar quando abrir';
      }
    }

    if (faq) {
      faq.innerHTML = t
        ? 'A próxima turma de ' + esc(curso) + ' é ' + dataLabel(t.dataTurma) + ', ' + horaDe(curso) + '. As demais datas estão na <a href="agenda.html">agenda</a>.'
        : 'As próximas datas são anunciadas na <a href="agenda.html">agenda</a> — entre na lista de espera para ser avisado(a).';
    }

    renderVagasBox(curso, t, vagasEl);
  }

  function renderVagasBox(curso, t, el) {
    if (!el) return;
    if (!t || !t.ativa) {
      el.innerHTML = '<div class="ck-vagas" role="status"><p class="ck-vagas-cheia">Turma ainda não foi aberta — ENTRE na lista de espera.</p></div>';
      return;
    }
    var rest = Number(t.restantes) || 0;
    var alerta = (typeof PDV_CONFIG !== 'undefined' && PDV_CONFIG.VAGAS_ALERTA) || 5;
    if (rest <= 0) {
      el.innerHTML = '<div class="ck-vagas" role="status"><p class="ck-vagas-cheia">TURMA LOTADA — ENTRE na lista de espera.</p></div>';
      return;
    }
    if (rest > alerta) { el.innerHTML = ''; return; }
    var cap = Number(t.vagas) || 10;
    var occ = Number(t.ocupadas);
    if (isNaN(occ)) occ = Math.max(0, cap - rest);
    var segs = '';
    for (var i = 0; i < cap; i++) segs += '<span class="seg' + (i < occ ? ' on' : '') + '"></span>';
    var status = rest <= 3 ? '<span class="ck-vagas-status">Restam ' + rest + '</span>' : '';
    el.innerHTML = '<div class="ck-vagas" role="status" aria-live="polite" aria-label="' + occ + ' de ' + cap + ' vagas ocupadas na turma de ' + esc(curso) + '">' +
      '<div class="ck-vagas-bar" aria-hidden="true">' + segs + '</div>' +
      '<p class="ck-vagas-txt"><strong>' + occ + ' de ' + cap + '</strong> vagas ocupadas nesta turma' + status + '</p></div>';
  }

  /* ---- AGENDA ---- */
  function agendaLink(t) {
    var cls = CURSOS[t.curso] ? CURSOS[t.curso].cls : 'pao';
    var tag = '<span class="tag">' + horaDe(t.curso) + '</span> ';
    var nome = 'Curso de ' + esc(t.curso) + ' para Iniciantes';
    if (t.ativa && !t.cheia) {
      return '<a class="agenda-course ' + cls + '" href="' + CURSOS[t.curso].slug + '?data=' + enc(t.dataTurma) + '">' + tag + nome + ' <span class="price-tag">R$275</span></a>';
    }
    var nota = t.ativa
      ? 'Turma cheia — <span data-espera-abrir style="text-decoration:underline;font-weight:700">entre na lista de espera</span>'
      : 'Avisamos quando abrir — <span data-espera-abrir style="text-decoration:underline;font-weight:700">lista de espera</span>';
    return '<a class="agenda-course ' + cls + '" href="javascript:void(0)" style="opacity:.7">' + tag + nome +
      ' <span class="price-tag">' + (t.ativa ? 'TURMA LOTADA' : 'EM BREVE') + '</span>' +
      '<span style="display:block;font-size:.8rem;color:#C62828;margin-top:4px">' + nota + '</span></a>';
  }

  function renderAgenda() {
    var box = qs('#agendaDinamico');
    if (!box) return;
    if (!turmas || !turmas.length) {
      box.innerHTML = '<div class="agenda-empty">Nenhuma turma anunciada ainda — <a href="javascript:void(0)" data-espera-abrir style="text-decoration:underline;font-weight:700">entre na lista de espera</a>.</div>';
      return;
    }
    var meses = {};
    turmas.forEach(function (t) {
      var mk = t.dataTurma.slice(3, 5) + '/' + t.dataTurma.slice(6, 10);
      (meses[mk] = meses[mk] || []).push(t);
    });
    var html = '';
    Object.keys(meses).sort().forEach(function (mk) {
      var partes = mk.split('/');
      html += '<div class="agenda-month"><h2 class="agenda-month-title">' + NOMES_MES[+partes[0] - 1] + ' <span>' + partes[1] + '</span></h2><div class="agenda-days">';
      var dias = {};
      meses[mk].forEach(function (t) { (dias[t.dataTurma] = dias[t.dataTurma] || []).push(t); });
      Object.keys(dias).sort().forEach(function (data) {
        html += '<div class="agenda-day"><div class="agenda-date"><span class="num">' + data.slice(0, 2) + '</span><span class="week">' + NOMES_DIA[parseBR(data).getDay()] + '</span></div>';
        html += '<div class="agenda-courses" data-turma="' + data + '">' + dias[data].map(agendaLink).join('') + '</div></div>';
      });
      html += '</div></div>';
    });
    box.innerHTML = html;
  }

  /* ---- LISTA DE ESPERA (binding global) ---- */
  document.addEventListener('click', function (e) {
    var alvo = e.target && e.target.closest ? e.target.closest('[data-espera-abrir]') : null;
    if (!alvo) return;
    e.preventDefault();
    if (typeof PdvEspera === 'undefined') return;
    PdvEspera.abrir({
      cursos: ['Pão', 'Pizza'],
      botao: 'Quero ser avisado',
      texto: 'Escolha um curso (ou os dois) e avisamos por WhatsApp/e-mail quando abrir vaga.'
    });
  });

  buscar(function () {
    renderHome();
    var curso = document.body && document.body.getAttribute('data-curso');
    if (curso) renderCurso(curso);
    renderAgenda();
  });

  window.PdvProximas = {
    buscar: buscar,
    proximaDe: proximaDe,
    turmaDe: turmaDe,
    lista: function () { return turmas; }
  };
})();
