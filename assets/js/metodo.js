/* =====================================================================
 * Método no tempo — programa do MÉTODO.
 * Guia de tempo + avisos da oficina (dobras → modelar → frio).
 * O método (tempos) e a receita (conteúdo) vêm do servidor
 * (?acao=metodo) e são passados a montar(); DEFAULT_METODO é fallback.
 * Estado em localStorage; contagem absoluta por Date.now(), então o
 * relógio não atrasa com a aba em background e o catch-up pega marcos
 * perdidos ao voltar.
 * ===================================================================== */
(function (root) {
  'use strict';

  var DEFAULT_METODO = { dobraIntervaloMin: 15, totalDobras: 6, modelarAposUltimaDobraMin: 90, frioAposModelarMin: 90 };
  var ordinais = ['', '1ª', '2ª', '3ª', '4ª', '5ª', '6ª'];

  function intMin(v, d) {
    var n = parseInt(v, 10);
    return isNaN(n) || n < 1 ? d : n;
  }
  function sanitizarMetodo(m) {
    m = m || {};
    return {
      dobraIntervaloMin: intMin(m.dobraIntervaloMin, DEFAULT_METODO.dobraIntervaloMin),
      totalDobras: intMin(m.totalDobras, DEFAULT_METODO.totalDobras),
      modelarAposUltimaDobraMin: intMin(m.modelarAposUltimaDobraMin, DEFAULT_METODO.modelarAposUltimaDobraMin),
      frioAposModelarMin: intMin(m.frioAposModelarMin, DEFAULT_METODO.frioAposModelarMin)
    };
  }

  function montarMarcos(m) {
    var list = [];
    for (var i = 1; i <= m.totalDobras; i++) {
      list.push({ chave: 'dobra' + i, tipo: 'dobra', n: i, tMin: i * m.dobraIntervaloMin });
    }
    var dobrasT = m.totalDobras * m.dobraIntervaloMin;
    var modelarT = dobrasT + m.modelarAposUltimaDobraMin;
    list.push({ chave: 'modelar', tipo: 'modelar', tMin: modelarT });
    list.push({ chave: 'frio', tipo: 'frio', tMin: modelarT + m.frioAposModelarMin });
    return { list: list, totalMin: list[list.length - 1].tMin, dobrasT: dobrasT, modelarT: modelarT };
  }

  var nucleo = {
    DEFAULT_METODO: DEFAULT_METODO,
    sanitizarMetodo: sanitizarMetodo,
    marcos: montarMarcos,
    rotulo: function (mk) {
      if (mk.tipo === 'dobra') return ordinais[mk.n] + ' dobra';
      if (mk.tipo === 'modelar') return 'Modelar a massa';
      return 'Ir para o frio';
    },
    faseAt: function (elapsedMin, marcos) {
      if (elapsedMin < marcos.dobrasT) return 'dobras';
      if (elapsedMin < marcos.modelarT) return 'descanso';
      if (elapsedMin < marcos.totalMin) return 'modelagem';
      return 'frio';
    },
    proximoMarco: function (elapsedMin, marcos) {
      for (var i = 0; i < marcos.list.length; i++) if (elapsedMin < marcos.list[i].tMin) return marcos.list[i];
      return null;
    },
    perdidos: function (elapsedMin, alertados, marcos) {
      var out = [];
      for (var i = 0; i < marcos.list.length; i++) {
        if (elapsedMin >= marcos.list[i].tMin && !alertados[marcos.list[i].chave]) out.push(marcos.list[i]);
      }
      return out;
    }
  };

  var audioCtx = null;
  function beep3() {
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      for (var i = 0; i < 3; i++) {
        var o = audioCtx.createOscillator();
        var g = audioCtx.createGain();
        var t0 = audioCtx.currentTime + i * 0.22;
        o.type = 'sine';
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(t0);
        o.stop(t0 + 0.2);
      }
    } catch (e) {}
  }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600);
    var m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    var s = String(sec % 60).padStart(2, '0');
    return h > 0 ? h + ':' + m + ':' + s : m + ':' + s;
  }

  function chave(cursoKey) { return 'pdvMetodo.' + cursoKey; }
  function lerState(cursoKey) {
    try { return JSON.parse(root.localStorage.getItem(chave(cursoKey)) || 'null'); } catch (e) { return null; }
  }
  function salvarState(cursoKey, st) {
    try { root.localStorage.setItem(chave(cursoKey), JSON.stringify(st)); } catch (e) {}
  }
  function novoState() {
    return { startAt: 0, alertados: {}, dobras: {}, ing: {} };
  }

  function montar(el, cursoKey, receita, metodo) {
    var metodoS = sanitizarMetodo(metodo);
    var marcos = montarMarcos(metodoS);
    var st = lerState(cursoKey) || novoState();
    var ing = receita.ingredientes || [];
    var timer = null;

    el.innerHTML =
      '<div class="pdv-metodo">' +
        '<div class="pdv-metodo-top"><h3>Método no tempo</h3>' +
          '<button type="button" class="pdv-reset" data-role="reset">Reiniciar</button></div>' +
        '<ol class="pdv-passos">' +
          '<li data-pass="dobras">1 · Dobras</li>' +
          '<li data-pass="modelar">2 · Modelar</li>' +
          '<li data-pass="frio">3 · Frio</li>' +
        '</ol>' +
        '<div class="pdv-relogio" data-role="relogio">—:—</div>' +
        '<div class="pdv-proximo" data-role="proximo"></div>' +
        '<div class="pdv-banner" data-role="banner" hidden></div>' +
        '<div class="pdv-blocos">' +
          '<div class="pdv-bloco pdv-ingredientes"><h4>Ingredientes</h4><ul></ul></div>' +
          '<div class="pdv-bloco pdv-dobras"><h4>Dobras</h4><ul></ul><p class="pdv-dica" data-role="dica"></p></div>' +
        '</div>' +
        '<button type="button" class="pdv-start" data-role="start">Começar</button>' +
      '</div>';

    var q = function (sel) { return el.querySelector(sel); };

    var ulIng = q('.pdv-ingredientes ul');
    ing.forEach(function (txt, i) {
      var li = document.createElement('li');
      li.innerHTML = '<label><input type="checkbox" data-ing="' + i + '"><span></span></label>';
      li.querySelector('span').textContent = txt;
      ulIng.appendChild(li);
    });

    var ulDb = q('.pdv-dobras ul');
    for (var n = 1; n <= metodoS.totalDobras; n++) {
      var li2 = document.createElement('li');
      li2.innerHTML = '<label><input type="checkbox" data-dobra="' + n + '"><span></span></label>';
      li2.querySelector('span').textContent = nucleo.rotulo({ tipo: 'dobra', n: n }) + ' · ' + (n * metodoS.dobraIntervaloMin) + ' min';
      ulDb.appendChild(li2);
    }

    function notif(texto) {
      if (root.Notification && root.Notification.permission === 'granted' && document.hidden) {
        try { new root.Notification('Pão de Verdade', { body: texto, tag: 'pdv-metodo' }); } catch (e) {}
      }
    }

    function banner(texto, urgente) {
      var b = q('[data-role="banner"]');
      if (!texto) { b.hidden = true; return; }
      b.hidden = false;
      b.style.background = urgente ? '#FFF0F0' : '#FDF3E3';
      b.style.color = urgente ? '#9B2C2C' : '#8A5A00';
      b.textContent = texto;
    }

    function avisar(mk, catchup) {
      var texto = nucleo.rotulo(mk);
      var dica = (receita.passos && receita.passos[mk.tipo]) ? ' — ' + receita.passos[mk.tipo] : '';
      if (catchup) {
        banner('Passou da hora: ' + texto + dica, true);
        return;
      }
      beep3();
      notif(texto);
      if (navigator.vibrate) { try { navigator.vibrate([200, 100, 200]); } catch (e) {} }
      banner(texto + dica);
    }

    function render() {
      var run = st.startAt > 0;
      var elapsedMin = run ? (Date.now() - st.startAt) / 60000 : 0;
      var prox = run ? nucleo.proximoMarco(elapsedMin, marcos) : null;
      var concluido = run && !prox;

      Array.prototype.forEach.call(el.querySelectorAll('[data-ing]'), function (cb) {
        cb.checked = !!st.ing[cb.getAttribute('data-ing')];
      });
      Array.prototype.forEach.call(el.querySelectorAll('[data-dobra]'), function (cb) {
        cb.checked = !!st.dobras[cb.getAttribute('data-dobra')];
      });

      Array.prototype.forEach.call(el.querySelectorAll('[data-pass]'), function (li) {
        var p = li.getAttribute('data-pass');
        var tMin = p === 'dobras' ? marcos.dobrasT
          : p === 'modelar' ? marcos.modelarT
          : marcos.totalMin;
        li.className = '';
        if (run && elapsedMin >= tMin) li.className = 'done';
        else if (prox && ((p === 'dobras' && prox.tipo === 'dobra') || (p === 'modelar' && prox.tipo === 'modelar') || (p === 'frio' && prox.tipo === 'frio'))) li.className = 'on';
      });

      var rel = q('[data-role="relogio"]');
      if (!run) { rel.textContent = '—:—'; }
      else if (concluido) { rel.textContent = 'Pronto'; }
      else { rel.textContent = fmt((prox.tMin * 60) - elapsedMin * 60); }

      var px = q('[data-role="proximo"]');
      if (!run) px.textContent = 'Toque em começar para acompanhar o tempo da massa.';
      else if (concluido) px.textContent = 'Massa no frio. Etapa concluída — agora é a fermentação a frio.';
      else px.textContent = 'Próximo: ' + nucleo.rotulo(prox) + ' em ' + fmt((prox.tMin * 60) - elapsedMin * 60);

      var dica = q('[data-role="dica"]');
      if (prox && receita.passos && receita.passos[prox.tipo]) dica.textContent = receita.passos[prox.tipo];
      else dica.textContent = '';

      q('[data-role="start"]').hidden = run;
    }

    function tick() {
      if (!st.startAt) return;
      var elapsedMin = (Date.now() - st.startAt) / 60000;
      var perd = nucleo.perdidos(elapsedMin, st.alertados, marcos);
      var novo = false;
      perd.forEach(function (mk) {
        st.alertados[mk.chave] = true;
        if (mk.tipo === 'dobra') st.dobras[mk.n] = true;
        avisar(mk, false);
        novo = true;
      });
      if (novo) salvarState(cursoKey, st);
      render();
    }

    function iniciarTicker() {
      if (timer) clearInterval(timer);
      timer = setInterval(tick, 1000);
    }

    function pararTicker() {
      if (timer) { clearInterval(timer); timer = null; }
    }

    function limparBanner() { banner(''); }

    function iniciar() {
      if (root.Notification && root.Notification.requestPermission) {
        try { root.Notification.requestPermission(); } catch (e) {}
      }
      beep3();
      st.startAt = Date.now();
      st.alertados = {};
      salvarState(cursoKey, st);
      limparBanner();
      iniciarTicker();
      render();
    }

    function reset() {
      if (!confirm('Reiniciar o timer e limpar os checklists da massa?')) return;
      pararTicker();
      try { root.localStorage.removeItem(chave(cursoKey)); } catch (e) {}
      st = novoState();
      limparBanner();
      render();
    }

    q('[data-role="start"]').addEventListener('click', iniciar);
    q('[data-role="reset"]').addEventListener('click', reset);
    el.addEventListener('change', function (e) {
      var cb = e.target;
      if (cb.hasAttribute('data-ing')) st.ing[cb.getAttribute('data-ing')] = cb.checked;
      if (cb.hasAttribute('data-dobra')) st.dobras[cb.getAttribute('data-dobra')] = cb.checked;
      salvarState(cursoKey, st);
      render();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      tick();
    });
    root.addEventListener('focus', function () { tick(); });

    var alive = st.startAt > 0;
    if (alive) {
      var elMin = (Date.now() - st.startAt) / 60000;
      var perdidos = nucleo.perdidos(elMin, st.alertados, marcos);
      var temPerdido = false;
      perdidos.forEach(function (mk) {
        st.alertados[mk.chave] = true;
        if (mk.tipo === 'dobra') st.dobras[mk.n] = true;
        avisar(mk, true);
        temPerdido = true;
      });
      if (temPerdido) salvarState(cursoKey, st);
      iniciarTicker();
    }
    render();
  }

  var PDVMetodo = { nucleo: nucleo, montar: montar };
  if (typeof module !== 'undefined' && module.exports) module.exports = PDVMetodo;
  root.PDVMetodo = PDVMetodo;
})(typeof window !== 'undefined' ? window : globalThis);
