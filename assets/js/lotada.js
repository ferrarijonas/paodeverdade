/* lotada.js — Pão de Verdade — trava de compra em todo o site.
   Quando a turma está cheia ou ainda não foi aberta, troca o botão de comprar
   por "TURMA LOTADA"/"EM BREVE" + lista de espera e esconde o pagamento direto.
   O estado bloqueado fica cacheado na sessão (5 min) para o próximo acesso
   já renderizar lotado, e é revalidado em segundo plano. */
(function () {
  'use strict';

  var API = (typeof PDV_CONFIG !== 'undefined' && PDV_CONFIG.WEB_APP_URL) || '';
  if (!API) return;

  var CACHE_TTL = 5 * 60 * 1000;
  var turmas = null;
  var falhou = false;
  var fila = [];
  var links = [];

  function norm(s) {
    return String(s || '').trim().toLowerCase()
      .replace(/[àáâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
      .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c');
  }
  function chave(curso, data) { return norm(curso) + '|' + norm(data); }

  function cacheLer() {
    try {
      var raw = sessionStorage.getItem('pdv_lotada');
      if (!raw) return {};
      var o = JSON.parse(raw) || {};
      var agora = Date.now();
      var out = {};
      for (var k in o) {
        var it = o[k];
        if (it && agora - (it.em || 0) < CACHE_TTL) out[k] = it;
      }
      return out;
    } catch (e) { return {}; }
  }
  function cacheGravar(curso, data, cheia) {
    try {
      var o = cacheLer();
      o[chave(curso, data)] = { cheia: !!cheia, em: Date.now() };
      sessionStorage.setItem('pdv_lotada', JSON.stringify(o));
    } catch (e) {}
  }
  function cacheLimpar(curso, data) {
    try {
      var o = cacheLer();
      delete o[chave(curso, data)];
      sessionStorage.setItem('pdv_lotada', JSON.stringify(o));
    } catch (e) {}
  }
  function cacheBloqueada(curso, data) {
    var st = cacheLer()[chave(curso, data)];
    return st ? st.cheia : null;
  }

  function abrirEspera(curso) {
    if (typeof PdvEspera === 'undefined') return;
    PdvEspera.abrir({
      cursos: ['Pão', 'Pizza'],
      selecionado: curso || '',
      botao: 'Entrar na lista de espera',
      texto: 'Avisamos por WhatsApp/e-mail quando abrir vaga. Sem compromisso.'
    });
  }

  function buscar(cb) {
    if (Array.isArray(turmas) || falhou) { cb(Array.isArray(turmas) ? turmas : null); return; }
    fila.push(cb);
    if (fila.length > 1) return;
    var id = 'pdvLotada' + Math.floor(Math.random() * 1e8);
    var done = false;
    function concluir(res) {
      if (done) return;
      done = true;
      delete window[id];
      turmas = Array.isArray(res) ? res : null;
      if (!Array.isArray(res)) falhou = true;
      var cbs = fila.splice(0);
      cbs.forEach(function (f) { f(turmas); });
    }
    window[id] = function (res) { concluir(res); };
    var s = document.createElement('script');
    s.onerror = function () { concluir(null); };
    s.src = API + '?acao=turmas&callback=' + id;
    document.body.appendChild(s);
  }

  function turmaDe(curso, data) {
    if (!Array.isArray(turmas)) return null;
    for (var i = 0; i < turmas.length; i++) {
      if (norm(turmas[i].curso) === norm(curso) && norm(turmas[i].dataTurma) === norm(data)) return turmas[i];
    }
    return undefined;
  }

  function parseLink(a) {
    try {
      var q = (a.getAttribute('href') || '').split('?')[1] || '';
      var p = new URLSearchParams(q);
      var curso = p.get('curso') || '';
      var data = p.get('data') || '';
      if (!curso || !data) return null;
      return { curso: curso, data: data };
    } catch (e) { return null; }
  }

  function virar(el, info, titulo, cor) {
    if (!el.dataset.pdvLotada) {
      el.dataset.pdvLotada = '1';
      el.dataset.pdvOrigHref = el.getAttribute('href') || '';
      el.dataset.pdvOrigText = el.textContent;
      el.dataset.pdvOrigClass = el.className;
      el.dataset.pdvOrigStyle = el.getAttribute('style') || '';
    }
    el.removeAttribute('href');
    el.classList.remove('btn-primary', 'btn-outline');
    el.style.cssText = 'background:' + cor + ';color:#fff;border-color:' + cor + ';opacity:1;cursor:pointer;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;line-height:1.25;gap:2px';
    el.innerHTML = '<strong style="letter-spacing:.06em">' + titulo + '</strong>' +
      '<small style="font-size:.72em;opacity:.92;font-weight:600;margin-top:2px">entrar na lista de espera</small>';
  }

  function restaurar(el) {
    if (!el.dataset.pdvLotada) return;
    delete el.dataset.pdvLotada;
    if (el.dataset.pdvOrigHref) el.setAttribute('href', el.dataset.pdvOrigHref);
    else el.removeAttribute('href');
    el.textContent = el.dataset.pdvOrigText || '';
    el.className = el.dataset.pdvOrigClass || '';
    if (el.dataset.pdvOrigStyle) el.setAttribute('style', el.dataset.pdvOrigStyle);
    else el.removeAttribute('style');
    delete el.dataset.pdvOrigHref;
    delete el.dataset.pdvOrigText;
    delete el.dataset.pdvOrigClass;
    delete el.dataset.pdvOrigStyle;
  }

  function pintarVagasCache() {
    var pv = document.getElementById('cursoVagas');
    if (!pv) return;
    var c = cacheLer();
    for (var i = 0; i < links.length; i++) {
      var st = c[chave(links[i].info.curso, links[i].info.data)];
      if (!st) continue;
      pv.innerHTML = st.cheia
        ? '<div class="ck-vagas" role="status"><p class="ck-vagas-cheia">TURMA LOTADA — entra na lista de espera.</p></div>'
        : '<div class="ck-vagas" role="status"><p class="ck-vagas-cheia">Turma ainda não foi aberta — entra na lista de espera.</p></div>';
      return;
    }
  }

  function aplicarCache() {
    var c = cacheLer();
    if (!Object.keys(c).length) return;
    var alguma = false;
    links.forEach(function (L) {
      var st = c[chave(L.info.curso, L.info.data)];
      if (!st) return;
      virar(L.el, L.info, st.cheia ? 'TURMA LOTADA' : 'EM BREVE', st.cheia ? '#C62828' : '#6E6A64');
      if (st.cheia) alguma = true;
    });
    pintarVagasCache();
    if (alguma) {
      Array.prototype.forEach.call(document.querySelectorAll('.pagar-direto'), function (a) { a.style.display = 'none'; });
    }
  }

  function proteger(L) {
    L.el.addEventListener('click', function (e) {
      if (!featureOn('lotada')) return;
      if (L.el.dataset.pdvLotada) {
        e.preventDefault();
        e.stopPropagation();
        abrirEspera(L.info.curso);
        return;
      }
      if (falhou) return;
      var t = turmaDe(L.info.curso, L.info.data);
      var bloqueado = (t === undefined) || (t !== null && Number(t.restantes) <= 0);
      if (bloqueado) {
        e.preventDefault();
        e.stopPropagation();
        abrirEspera(L.info.curso);
        return;
      }
      if (t === null && !L.segurando) {
        e.preventDefault();
        e.stopPropagation();
        L.segurando = true;
        var txt = L.el.textContent;
        L.el.textContent = 'Verificando vagas…';
        L.el.style.pointerEvents = 'none';
        L.tmr = setTimeout(function () {
          if (turmaDe(L.info.curso, L.info.data) === null) {
            L.segurando = false;
            L.el.style.pointerEvents = '';
            L.el.textContent = txt;
          }
        }, 6000);
      }
    });
  }

  function gatear() {
    if (falhou) return;
    var algumaBloqueada = false;
    links.forEach(function (L) {
      var t = turmaDe(L.info.curso, L.info.data);
      if (L.segurando) {
        L.segurando = false;
        clearTimeout(L.tmr);
        L.el.style.pointerEvents = '';
        if (t === undefined || (t !== null && Number(t.restantes) <= 0)) abrirEspera(L.info.curso);
        else if (t !== null) window.location.href = L.el.href;
      }
      if (t === undefined) {
        virar(L.el, L.info, 'EM BREVE', '#6E6A64');
        cacheGravar(L.info.curso, L.info.data, false);
        algumaBloqueada = true;
        return;
      }
      if (t !== null && Number(t.restantes) <= 0) {
        virar(L.el, L.info, 'TURMA LOTADA', '#C62828');
        cacheGravar(L.info.curso, L.info.data, true);
        algumaBloqueada = true;
        return;
      }
      restaurar(L.el);
      cacheLimpar(L.info.curso, L.info.data);
    });
    var page = links[0] ? links[0].info : null;
    if (page) {
      Array.prototype.forEach.call(document.querySelectorAll('.pagar-direto'), function (a) {
        a.addEventListener('click', function (e) {
          var t = turmaDe(page.curso, page.data);
          if (t === undefined || (t !== null && Number(t.restantes) <= 0)) {
            e.preventDefault();
            e.stopPropagation();
            abrirEspera(page.curso);
          }
        });
        a.style.display = algumaBloqueada ? 'none' : '';
      });
    }
  }

  Array.prototype.forEach.call(document.querySelectorAll('a[href*="checkout.html"]'), function (a) {
    var info = parseLink(a);
    if (info) {
      var L = { el: a, info: info, segurando: false, tmr: null };
      links.push(L);
      proteger(L);
    }
  });

  var flags = null;
  function featureOn(nome) { return !flags || flags[nome] !== false; }
  function buscarFlags(cb) {
    var fid = 'pdvFlags' + Math.floor(Math.random() * 1e8);
    var done = false;
    window[fid] = function (res) {
      if (done) return;
      done = true;
      delete window[fid];
      flags = res || null;
      cb();
    };
    var s = document.createElement('script');
    s.onerror = function () { if (!done) { done = true; delete window[fid]; flags = null; cb(); } };
    setTimeout(function () { if (!done) { done = true; delete window[fid]; flags = null; cb(); } }, 8000);
    s.src = API + '?acao=flags&callback=' + fid;
    document.body.appendChild(s);
  }

  buscarFlags(function () {
    if (featureOn('lotada')) aplicarCache();
    var pendentes = window._pdvLotadaPendentes || [];
    window._pdvLotadaPendentes = [];
    pendentes.forEach(function (cb) { buscar(cb); });
    if (featureOn('lotada')) buscar(function () { gatear(); });
  });

  window.PdvLotada = {
    buscar: buscar,
    abrirEspera: abrirEspera,
    turmaDe: turmaDe,
    cacheBloqueada: cacheBloqueada,
    norm: norm
  };
})();