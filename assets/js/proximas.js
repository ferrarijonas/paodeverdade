/* proximas.js — Pão de Verdade — estado único das turmas.
   Busca ?acao=estado (versão + turmas futuras + status) e renderiza:
   hero da home, páginas de curso e agenda. Uma única fonte de verdade
   para data, vagas e disponibilidade. */
(function () {
  'use strict';

  var API = (typeof PDV_CONFIG !== 'undefined' && PDV_CONFIG.WEB_APP_URL) || '';
  var CURSOS = {
    'Pão': { hora: '8h às 13h', slug: 'curso-pao.html', cls: 'pao' },
    'Massas Doces': { hora: '14h às 19h', slug: 'curso-massas-doces.html', cls: 'massas', checkout: false, wa: '5534936186847' },
    'Pizza': { hora: '17h às 22h', slug: 'curso-pizza.html', cls: 'pizza' }
  };
  var NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  var NOMES_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  var estado = null;

  /* Cache curto (60 s) + fallback para o último estado bom.
     O servidor é a fonte da verdade; o cache só evita requisição repetida. */
  var CACHE_KEY = 'pdv_estado_v2';
  var CACHE_TTL = 60 * 1000;
  var CACHE_MAX = 24 * 60 * 60 * 1000;

  function cacheObter(tolerante) {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || typeof o.em !== 'number' || !o.dados) return null;
      var limite = tolerante ? CACHE_MAX : CACHE_TTL;
      if (Date.now() - o.em > limite) return null;
      return o;
    } catch (eC) { return null; }
  }

  function cacheGravar(dados) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ em: Date.now(), dados: dados }));
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

  function normalizarEstado(res) {
    if (res && res.ok && Array.isArray(res.turmas)) {
      return { ok: true, versao: String(res.versao || ''), atualizadoEm: res.atualizadoEm || '', turmas: res.turmas };
    }
    return null;
  }

  function buscarRemoto(cb) {
    jsonp('acao=estado', function (res) {
      var e = normalizarEstado(res);
      if (e) return cb(e);
      /* Compatibilidade: se o backend ainda não tem ?acao=estado, usa proximas. */
      jsonp('acao=proximas', function (res2) {
        cb(Array.isArray(res2) ? { ok: true, versao: 'legacy', atualizadoEm: '', turmas: res2 } : null);
      });
    });
  }

  function buscar(cb) {
    if (estado) return cb(estado);
    var fresco = cacheObter(false);
    if (fresco) { estado = fresco.dados; cb(estado); return; }
    buscarRemoto(function (e) {
      if (e) {
        estado = e;
        cacheGravar(e);
        cb(estado);
        return;
      }
      var velho = cacheObter(true);
      estado = velho ? velho.dados : null;
      cb(estado);
    });
  }

  function lista() {
    return estado && Array.isArray(estado.turmas) ? estado.turmas : [];
  }

  function statusDe(t) {
    if (!t) return 'sem_turma';
    if (t.status) return t.status;
    if (t.ativa === false) return 'indisponivel';
    return Number(t.restantes) > 0 ? 'aberta' : 'esgotada';
  }

  function proximaDe(curso) {
    var primeira = null;
    var arr = lista();
    for (var i = 0; i < arr.length; i++) {
      if (norm(arr[i].curso) !== norm(curso)) continue;
      if (!primeira) primeira = arr[i];
      if (statusDe(arr[i]) === 'aberta') return arr[i];
    }
    return primeira;
  }

  function turmaDe(curso, data) {
    var arr = lista();
    for (var i = 0; i < arr.length; i++) {
      if (norm(arr[i].curso) === norm(curso) && String(arr[i].dataTurma) === String(data)) return arr[i];
    }
    return null;
  }

  function cursosDaEspera() {
    var out = [], vistos = {};
    lista().forEach(function (t) {
      var c = String(t.curso || '').trim();
      if (!c || vistos[norm(c)]) return;
      vistos[norm(c)] = 1;
      out.push(c);
    });
    return out.length ? out : ['Pão', 'Massas Doces', 'Pizza'];
  }

  function hrefCheckout(curso, t) {
    return 'checkout.html?curso=' + enc(curso) + '&data=' + enc(t.dataTurma);
  }

  function hrefWhats(curso, t) {
    var info = CURSOS[curso] || {};
    var msg = 'Olá! Quero minha vaga no Curso de ' + curso + ' (' + t.dataTurma + ', ' + horaDe(curso) + ').';
    return 'https://wa.me/' + (info.wa || '5534936186847') + '?text=' + enc(msg);
  }

  /* ---- HOME ---- */
  function renderHome() {
    var box = qs('#heroTurma');
    if (!box) return;
    var date = qs('.hero-date', box);
    var btns = qs('.btn-group', box);
    var arr = lista();
    if (!arr.length) {
      if (date) date.innerHTML = '<span class="date-head">📅 Próxima turma</span><br>Em breve — entre na lista de espera e avisamos quando abrir.';
      if (btns) btns.innerHTML = '<a class="btn btn-primary btn-lg" href="javascript:void(0)" data-espera-abrir>Entrar na lista de espera</a>';
      return;
    }
    var data = arr[0].dataTurma;
    var destaData = arr.filter(function (t) { return String(t.dataTurma) === String(data); });
    if (date) {
      date.innerHTML = '<span class="date-head">📅 Turma de ' + data.slice(0, 5) + '</span><br>' +
        destaData.map(function (t) { return esc(t.curso) + ' · ' + horaDe(t.curso); }).join('<br>');
    }
    if (btns) {
      btns.innerHTML = destaData.map(function (t, i) {
        var prim = i === 0 ? 'btn-primary' : 'btn-outline';
        var st = statusDe(t);
        if (st === 'aberta') {
          var info = CURSOS[t.curso] || {};
          var href = (info.slug || 'agenda.html') + '?data=' + enc(t.dataTurma);
          return '<a class="btn ' + prim + ' btn-lg" href="' + href + '">Garantir vaga em ' + esc(t.curso) + '</a>';
        }
        var rotulo = st === 'esgotada' ? 'Turma lotada — entrar na lista de espera' : 'Em breve — entrar na lista de espera';
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
    if (!t && !qData) t = proximaDe(curso);

    var st = statusDe(t);
    if (elData) elData.textContent = t ? (dataLabel(t.dataTurma) + ' · ' + horaDe(curso)) : 'nova turma em breve';

    if (cta) {
      var info = CURSOS[curso] || {};
      if (t && st === 'aberta') {
        cta.setAttribute('href', info.checkout === false ? hrefWhats(curso, t) : hrefCheckout(curso, t));
        cta.textContent = info.checkout === false ? '💬 Garantir minha vaga — R$275' : 'Garantir minha vaga — R$275';
        cta.removeAttribute('data-espera-abrir');
      } else {
        cta.removeAttribute('href');
        cta.setAttribute('data-espera-abrir', '');
        cta.textContent = st === 'esgotada'
          ? 'TURMA LOTADA — entrar na lista de espera'
          : (st === 'indisponivel' ? 'Em breve — avisar quando abrir' : 'Entrar na lista de espera');
      }
    }

    if (faq) {
      faq.innerHTML = t
        ? 'A próxima turma de ' + esc(curso) + ' é ' + dataLabel(t.dataTurma) + ', ' + horaDe(curso) + '. As demais datas estão na <a href="agenda.html">agenda</a>.'
        : 'As próximas datas são anunciadas na <a href="agenda.html">agenda</a> — entre na lista de espera para ser avisado(a).';
    }

    renderVagasBox(curso, t, st, vagasEl);
  }

  function renderVagasBox(curso, t, st, el) {
    if (!el) return;
    if (!t || st === 'indisponivel') {
      el.innerHTML = '<div class="ck-vagas" role="status"><p class="ck-vagas-cheia">Turma ainda não foi aberta — ENTRE na lista de espera.</p></div>';
      return;
    }
    var rest = Number(t.restantes) || 0;
    if (st === 'esgotada' || rest <= 0) {
      el.innerHTML = '<div class="ck-vagas" role="status"><p class="ck-vagas-cheia">TURMA LOTADA — ENTRE na lista de espera.</p></div>';
      return;
    }
    var alerta = (typeof PDV_CONFIG !== 'undefined' && PDV_CONFIG.VAGAS_ALERTA) || 5;
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
    var info = CURSOS[t.curso] || {};
    var cls = info.cls || 'pao';
    var tag = '<span class="tag">' + horaDe(t.curso) + '</span> ';
    var nome = 'Curso de ' + esc(t.curso) + ' para Iniciantes';
    var st = statusDe(t);
    if (st === 'aberta') {
      return '<a class="agenda-course ' + cls + '" href="' + info.slug + '?data=' + enc(t.dataTurma) + '">' + tag + nome + ' <span class="price-tag">R$275</span></a>';
    }
    var nota = st === 'esgotada'
      ? 'Turma cheia — <span data-espera-abrir style="text-decoration:underline;font-weight:700">entre na lista de espera</span>'
      : 'Avisamos quando abrir — <span data-espera-abrir style="text-decoration:underline;font-weight:700">lista de espera</span>';
    return '<a class="agenda-course ' + cls + '" href="javascript:void(0)" style="opacity:.7">' + tag + nome +
      ' <span class="price-tag">' + (st === 'esgotada' ? 'TURMA LOTADA' : 'EM BREVE') + '</span>' +
      '<span style="display:block;font-size:.8rem;color:#C62828;margin-top:4px">' + nota + '</span></a>';
  }

  function renderAgenda() {
    var box = qs('#agendaDinamico');
    if (!box) return;
    var arr = lista();
    if (!arr.length) {
      box.innerHTML = '<div class="agenda-empty">Nenhuma turma anunciada ainda — <a href="javascript:void(0)" data-espera-abrir style="text-decoration:underline;font-weight:700">entre na lista de espera</a>.</div>';
      return;
    }
    var meses = {};
    arr.forEach(function (t) {
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
      cursos: cursosDaEspera(),
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
    lista: lista,
    estado: function () { return estado; }
  };
})();
