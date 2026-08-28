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
    falarTexto: function (mk) {
      var dobrasFala = ['', 'Primeira dobra.', 'Segunda dobra.', 'Terceira dobra.', 'Quarta dobra.', 'Quinta dobra.', 'Sexta dobra.'];
      if (mk.tipo === 'dobra') return dobrasFala[mk.n] || ('Dobra número ' + mk.n + '.');
      if (mk.tipo === 'modelar') return 'Hora de modelar a massa.';
      return 'Hora de ir para o frio.';
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
  function aquecerAudio() {
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {}
  }
  function tocarTone(freq, t, dur, vol) {
    var o = audioCtx.createOscillator();
    var g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function alarme() {
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var t = audioCtx.currentTime;
      for (var i = 0; i < 6; i++) tocarTone(i % 2 === 0 ? 880 : 660, t + i * 0.30, 0.16, 0.4);
      var t0 = t + 6 * 0.30;
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(520, t0);
      o.frequency.exponentialRampToValueAtTime(1320, t0 + 0.65);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start(t0);
      o.stop(t0 + 0.72);
    } catch (e) {}
  }
  function melhorVozPt() {
    try {
      var vs = root.speechSynthesis.getVoices();
      var pt = vs.filter(function (v) { return /^pt/i.test(v.lang); });
      if (!pt.length) return null;
      pt.sort(function (a, b) {
        var score = function (v) {
          var n = (v.name || '').toLowerCase();
          var s = 0;
          if (n.indexOf('online') !== -1) s += 4;
          if (n.indexOf('natural') !== -1) s += 3;
          if (n.indexOf('maria') !== -1) s += 2;
          if (n.indexOf('davos') !== -1) s += 2;
          if (n.indexOf('francisca') !== -1) s += 1;
          return s;
        };
        return score(b) - score(a);
      });
      return pt[0];
    } catch (e) { return null; }
  }
  function primeVoz() {
    try {
      if (!root.speechSynthesis) return;
      root.speechSynthesis.getVoices();
      if (root.speechSynthesis.onvoiceschanged === null || root.speechSynthesis.onvoiceschanged === undefined) {
        root.speechSynthesis.onvoiceschanged = function () { root.speechSynthesis.getVoices(); };
      }
    } catch (e) {}
  }
  function falarLocal(texto) {
    try {
      if (!root.speechSynthesis) return;
      root.speechSynthesis.cancel();
      if (root.speechSynthesis.paused) root.speechSynthesis.resume();
      var u = new SpeechSynthesisUtterance(texto);
      u.lang = 'pt-BR';
      u.rate = 0.98;
      u.volume = 1;
      var v = melhorVozPt();
      if (v) u.voice = v;
      root.speechSynthesis.speak(u);
    } catch (e) {}
  }

  var ttsCfg = { url: '', on: false };
  var ttsSeq = 0;
  function ttsFalar(texto) {
    var cb = 'pdvTts' + (ttsSeq++);
    var done = false;
    var timeout = setTimeout(function () {
      if (!done) { done = true; falarLocal(texto); }
    }, 9000);
    window[cb] = function (res) {
      clearTimeout(timeout);
      if (done) return;
      done = true;
      delete window[cb];
      if (res && res.ok && res.audio) tocarBase64(res.audio, texto);
      else falarLocal(texto);
    };
    var s = document.createElement('script');
    s.onerror = function () {
      clearTimeout(timeout);
      if (!done) { done = true; delete window[cb]; falarLocal(texto); }
    };
    s.src = ttsCfg.url + '?acao=tts&texto=' + encodeURIComponent(texto) + '&callback=' + cb;
    document.body.appendChild(s);
  }
  function tocarBase64(b64, texto) {
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) { falarLocal(texto); return; }
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var bin = root.atob(b64);
      var buf = new ArrayBuffer(bin.length);
      var bytes = new Uint8Array(buf);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      audioCtx.decodeAudioData(buf, function (buffer) {
        var src = audioCtx.createBufferSource();
        src.buffer = buffer;
        src.connect(audioCtx.destination);
        src.start();
      }, function () { falarLocal(texto); });
    } catch (e) { falarLocal(texto); }
  }
  function falar(texto) {
    if (ttsCfg.on && ttsCfg.url) { ttsFalar(texto); return; }
    falarLocal(texto);
  }
  function chime() {
    try {
      aquecerAudio();
      if (!audioCtx) return;
      var t = audioCtx.currentTime;
      tocarTone(660, t, 0.12, 0.25);
      tocarTone(880, t + 0.14, 0.16, 0.25);
    } catch (e) {}
  }
  function registrarDesbloqueioGlobal() {
    if (root._pdvAudioPronto) return;
    root._pdvAudioPronto = true;
    var desbloquear = function () { aquecerAudio(); primeVoz(); };
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
      try { root.document.addEventListener(ev, desbloquear, { once: true, passive: true }); } catch (e) {
        try { root.document.addEventListener(ev, desbloquear); } catch (e2) {}
      }
    });
  }

  var wakeLock = null;
  function pedirWakeLock() {
    try {
      if (!root.navigator || !root.navigator.wakeLock) return;
      root.navigator.wakeLock.request('screen').then(function (wl) {
        wakeLock = wl;
      }).catch(function () {});
    } catch (e) {}
  }
  function soltarWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
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

  function montar(el, cursoKey, receita, metodo, cfg) {
    cfg = cfg || {};
    ttsCfg.url = cfg.endpoint || '';
    ttsCfg.on = !!(cfg.tts && ttsCfg.url);
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
        '<div class="pdv-anel-wrap">' +
          '<svg class="pdv-anel" viewBox="0 0 120 120" aria-hidden="true">' +
            '<circle class="pdv-anel-bg" cx="60" cy="60" r="52"></circle>' +
            '<circle class="pdv-anel-fg" cx="60" cy="60" r="52" data-role="anel"></circle>' +
          '</svg>' +
          '<div class="pdv-relogio" data-role="relogio">—:—</div>' +
        '</div>' +
        '<div class="pdv-proximo" data-role="proximo"></div>' +
        '<div class="pdv-banner" data-role="banner" hidden></div>' +
        '<div class="pdv-blocos">' +
          '<div class="pdv-bloco pdv-ingredientes"><h4>Ingredientes</h4><ul></ul></div>' +
          '<div class="pdv-bloco pdv-dobras"><h4>Dobras</h4><ul></ul><p class="pdv-dica" data-role="dica"></p></div>' +
        '</div>' +
        '<button type="button" class="pdv-start" data-role="start">Começar</button>' +
        '<button type="button" class="pdv-testar" data-role="testar">🔔 Testar som e aviso</button>' +
        '<p class="pdv-som-status" data-role="somstatus" hidden></p>' +
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

    function fecharAlerta() {
      var ov = document.getElementById('pdvAlerta');
      if (!ov) return;
      if (ov._auto) clearTimeout(ov._auto);
      if (ov.parentNode) ov.parentNode.removeChild(ov);
    }

    function mostrarAlerta(mk) {
      var texto = nucleo.rotulo(mk);
      var dica = (receita.passos && receita.passos[mk.tipo]) || '';
      fecharAlerta();
      var ov = document.createElement('div');
      ov.id = 'pdvAlerta';
      ov.className = 'pdv-alerta';
      ov.setAttribute('role', 'alertdialog');
      var inner = document.createElement('div');
      inner.className = 'pdv-alerta-inner';
      var kick = document.createElement('div');
      kick.className = 'pdv-alerta-kicker';
      kick.textContent = 'Pão de Verdade';
      var titulo = document.createElement('div');
      titulo.className = 'pdv-alerta-titulo';
      titulo.textContent = texto.toUpperCase();
      var msg = document.createElement('p');
      msg.className = 'pdv-alerta-msg';
      msg.textContent = dica || texto;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pdv-alerta-btn';
      btn.textContent = 'OK, feito';
      inner.appendChild(kick);
      inner.appendChild(titulo);
      if (dica) inner.appendChild(msg);
      inner.appendChild(btn);
      ov.appendChild(inner);
      ov.addEventListener('click', fecharAlerta);
      btn.addEventListener('click', function (e) { e.stopPropagation(); fecharAlerta(); });
      document.body.appendChild(ov);
      ov._auto = setTimeout(fecharAlerta, 8000);
    }

    function avisar(mk, catchup) {
      var texto = nucleo.rotulo(mk);
      var dica = (receita.passos && receita.passos[mk.tipo]) ? ' — ' + receita.passos[mk.tipo] : '';
      if (catchup) {
        banner('Passou da hora: ' + texto + dica, true);
        return;
      }
      alarme();
      falar(nucleo.falarTexto(mk));
      notif(texto);
      if (navigator.vibrate) { try { navigator.vibrate([300, 100, 300, 100, 500]); } catch (e) {} }
      banner(texto + dica);
      mostrarAlerta(mk);
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

      var anel = el.querySelector('[data-role="anel"]');
      if (anel) {
        var circ = 2 * Math.PI * 52;
        var frac = run ? Math.min(1, elapsedMin / marcos.totalMin) : 0;
        anel.style.strokeDasharray = circ;
        anel.style.strokeDashoffset = circ * (1 - frac);
      }

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
      if (elapsedMin >= marcos.totalMin) soltarWakeLock();
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
      aquecerAudio();
      chime();
      st.startAt = Date.now();
      st.alertados = {};
      salvarState(cursoKey, st);
      limparBanner();
      iniciarTicker();
      pedirWakeLock();
      render();
    }

    function reset() {
      if (!confirm('Reiniciar o timer e limpar os checklists da massa?')) return;
      pararTicker();
      soltarWakeLock();
      try { root.localStorage.removeItem(chave(cursoKey)); } catch (e) {}
      st = novoState();
      limparBanner();
      render();
    }

    q('[data-role="start"]').addEventListener('click', iniciar);
    q('[data-role="reset"]').addEventListener('click', reset);
    q('[data-role="testar"]').addEventListener('click', function () {
      aquecerAudio();
      primeVoz();
      if (root.Notification && root.Notification.requestPermission) {
        try { root.Notification.requestPermission(); } catch (e) {}
      }
      alarme();
      falar('Aqui é o Pão de Verdade. Terceira dobra.');
      if (navigator.vibrate) { try { navigator.vibrate([300, 100, 300]); } catch (e) {} }
      var ok = !!(audioCtx && audioCtx.state === 'running');
      var st2 = q('[data-role="somstatus"]');
      st2.hidden = false;
      st2.className = 'pdv-som-status ' + (ok ? 'ok' : 'erro');
      st2.textContent = ok
        ? 'Som e voz funcionando. Se não ouviu nada, verifique o volume do navegador e do sistema.'
        : 'O navegador bloqueou o som. Clique em qualquer lugar da página e tente de novo.';
    });
    el.addEventListener('change', function (e) {
      var cb = e.target;
      if (cb.hasAttribute('data-ing')) st.ing[cb.getAttribute('data-ing')] = cb.checked;
      if (cb.hasAttribute('data-dobra')) st.dobras[cb.getAttribute('data-dobra')] = cb.checked;
      salvarState(cursoKey, st);
      render();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      if (st.startAt && (Date.now() - st.startAt) / 60000 < marcos.totalMin) pedirWakeLock();
      tick();
    });
    root.addEventListener('focus', function () {
      if (st.startAt && (Date.now() - st.startAt) / 60000 < marcos.totalMin) pedirWakeLock();
      tick();
    });

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

  registrarDesbloqueioGlobal();

  var PDVMetodo = { nucleo: nucleo, montar: montar };
  if (typeof module !== 'undefined' && module.exports) module.exports = PDVMetodo;
  root.PDVMetodo = PDVMetodo;
})(typeof window !== 'undefined' ? window : globalThis);
