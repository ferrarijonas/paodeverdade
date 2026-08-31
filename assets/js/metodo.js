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

  var PASSOS_PADRAO = {
    dobra: 'Molhe a mão, puxe uma borda da massa e dobre sobre o centro. Gire a vasilha e repita nos 4 lados.',
    modelar: 'Com a bancada enfarinhada, modele o pão sem esmagar o gás da massa.',
    frio: 'Leve a massa modelada à geladeira em vasilha coberta com filme (fermentação a frio).'
  };

  var RECEITAS = {
    pao: {
      label: 'Uma massa · três fermentos',
      receitas: [
        {
          nome: 'Pão de Cristo',
          unidade: 'pão',
          unidadePlural: 'pães',
          qtdPadrao: 1,
          pesoPadrao: 800,
          base: {
            farinha: { nome: 'Farinha de trigo', pct: 100 },
            agua: { nome: 'Água', pct: 65 },
            acucar: { nome: 'Açúcar', pct: 5 },
            sal: { nome: 'Sal', pct: 2 },
            fermentoBio: { nome: 'Fermento biológico seco', pct: 0.3 }
          },
          versoes: {
            biologica: { nome: 'Pão Branco simples', fermento: 'Fermento biológico', nota: 'Fermento biológico' },
            garrafa: { nome: 'Pão de Cristo', fermento: 'Fermento natural líquido (fermento de cristo)', nota: 'Fermento natural líquido · refresco na noite anterior' },
            levain: { nome: 'Pão Italiano básico', fermento: 'Fermento natural (levain)', nota: 'Fermento natural (levain) · alimentado 4h antes' }
          }
        },
        {
          nome: 'Rosca',
          unidade: 'rosca',
          unidadePlural: 'roscas',
          qtdPadrao: 1,
          pesoPadrao: 454,
          base: {
            farinha: { nome: 'Farinha Lunar Azul', pct: 100 },
            agua: { nome: 'Água', pct: 38 },
            acucar: { nome: 'Açúcar Branco', pct: 23 },
            sal: { nome: 'Sal', pct: 0.3 },
            fermentoBio: { nome: 'Levedura', pct: 0.5 },
            extras: [
              { nome: 'Ovos', pct: 11 },
              { nome: 'Manteiga', pct: 13 },
              { nome: 'Óleo Girassol', pct: 10 }
            ]
          },
          versoes: {
            biologica: { nome: 'Rosca simples', fermento: 'Fermento biológico', nota: 'Fermento biológico' },
            garrafa: { nome: 'Rosca de Cristo', fermento: 'Fermento natural líquido (fermento de cristo)', nota: 'Fermento natural líquido · refresco na noite anterior' },
            levain: { nome: 'Rosca Italiana', fermento: 'Fermento natural (levain)', nota: 'Fermento natural (levain) · alimentado 4h antes' }
          }
        }
      ]
    },
    pizza: {
      label: null,
      receitas: [
        {
          nome: 'Massa de Pizza',
          unidade: 'disco de pizza',
          unidadePlural: 'discos de pizza',
          qtdPadrao: 6,
          pesoPadrao: 278.8,
          base: {
            farinha: { nome: 'Farinha de trigo', pct: 100 },
            agua: { nome: 'Água fria', pct: 65 },
            acucar: { nome: 'Açúcar', pct: 0 },
            sal: { nome: 'Sal', pct: 2 },
            fermentoBio: { nome: 'Fermento biológico seco', pct: 0.3 }
          },
          versoes: {
            biologica: { nome: 'Massa de Pizza', fermento: 'Fermento biológico', nota: 'Longa fermentação · 6 discos grandes' }
          }
        }
      ]
    }
  };

  function escTxt(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function somaPct(grupos) {
    var s = 0;
    grupos.forEach(function (g) { g.itens.forEach(function (it) { s += it.pct; }); });
    return s;
  }
  function fmtG(v) {
    if (v >= 10) return String(Math.round(v));
    return String(Math.round(v * 10) / 10).replace('.', ',');
  }
  function fmtPct(p) {
    return String(Math.round(p * 10) / 10).replace('.', ',') + '%';
  }
  function r1(v) {
    return Math.round(v * 10) / 10;
  }
  function it(nome, pct) {
    return { nome: nome, pct: pct };
  }
  function addIt(list, nome, pct) {
    if (pct > 0) list.push(it(nome, r1(pct)));
  }
  function versaoValida(base, vk) {
    var W = base && base.agua ? base.agua.pct : 0;
    var S = base && base.sal ? base.sal.pct : 0;
    if (vk === 'garrafa') return W > 0 && S >= 0.1;
    if (vk === 'levain') return W >= 7;
    return true;
  }
  function gruposBiologica(b) {
    var l = [];
    addIt(l, b.farinha.nome, b.farinha.pct);
    addIt(l, b.agua.nome, b.agua.pct);
    if (b.acucar) addIt(l, b.acucar.nome, b.acucar.pct);
    if (b.sal) addIt(l, b.sal.nome, b.sal.pct);
    if (b.extras) b.extras.forEach(function (ex) { addIt(l, ex.nome, ex.pct); });
    if (b.fermentoBio) addIt(l, b.fermentoBio.nome, b.fermentoBio.pct);
    return [{ nome: null, itens: l }];
  }
  function gruposGarrafa(b) {
    var W = b.agua.pct;
    var A = b.acucar ? b.acucar.pct : 0;
    var S = b.sal ? b.sal.pct : 0;
    var pre = [it('Fermento natural líquido (fermento de cristo)', r1(W / 3))];
    addIt(pre, b.agua.nome, (2 * W) / 3);
    addIt(pre, b.farinha.nome, 7);
    addIt(pre, b.acucar ? b.acucar.nome : 'Açúcar', 1);
    addIt(pre, b.sal ? b.sal.nome : 'Sal', 0.1);
    var principal = [];
    addIt(principal, b.farinha.nome, 93);
    addIt(principal, b.acucar ? b.acucar.nome : 'Açúcar', A);
    addIt(principal, b.sal ? b.sal.nome : 'Sal', S - 0.1);
    if (b.extras) b.extras.forEach(function (ex) { addIt(principal, ex.nome, ex.pct); });
    return [
      { nome: 'Pré-fermento — refresco (na noite anterior)', itens: pre },
      { nome: 'Massa principal (na manhã)', itens: principal }
    ];
  }
  function gruposLevain(b) {
    var W = b.agua.pct;
    var A = b.acucar ? b.acucar.pct : 0;
    var S = b.sal ? b.sal.pct : 0;
    var lev = [it('Fermento natural (levain)', 7)];
    addIt(lev, b.farinha.nome, 7);
    addIt(lev, b.agua.nome, 7);
    var principal = [];
    addIt(principal, b.farinha.nome, 93);
    addIt(principal, b.agua.nome, W - 7);
    addIt(principal, b.acucar ? b.acucar.nome : 'Açúcar', A);
    addIt(principal, b.sal ? b.sal.nome : 'Sal', S);
    if (b.extras) b.extras.forEach(function (ex) { addIt(principal, ex.nome, ex.pct); });
    return [
      { nome: 'Levain — alimentar 4h antes (no mínimo)', itens: lev },
      { nome: 'Massa principal', itens: principal }
    ];
  }
  function gruposDaVersao(r, vk) {
    if (vk === 'garrafa') return gruposGarrafa(r.base);
    if (vk === 'levain') return gruposLevain(r.base);
    return gruposBiologica(r.base);
  }
  function receitaView(r, vk) {
    var v = r.versoes[vk];
    return {
      nome: v.nome,
      nota: v.nota,
      unidade: r.unidade,
      unidadePlural: r.unidadePlural,
      grupos: gruposDaVersao(r, vk)
    };
  }
  function htmlGrupos(r, f, ridx, versao) {
    var h = '';
    r.grupos.forEach(function (g, gi) {
      var isPre = false;
      if (g.nome) {
        isPre = g.nome.indexOf('Pré-fermento') === 0 || g.nome.indexOf('Levain') === 0;
        h += '<div class="pdv-grupo-nome' + (isPre ? ' pdv-pre' : '') + '">' + (isPre ? '⏱ ' : '') + escTxt(g.nome) + '</div>';
      }
      var sub = 0, subPct = 0;
      h += '<table class="pdv-tabela"><thead><tr><th>Ingrediente</th><th>% padeiro</th><th>Gramas</th></tr></thead><tbody>';
      g.itens.forEach(function (it, i) {
        var v = it.pct * f;
        sub += v;
        subPct += it.pct;
        h += '<tr><td><label><input type="checkbox" data-ing="' + versao + ':' + ridx + '.' + gi + '.' + i + '"><span>' + escTxt(it.nome) + '</span></label></td>' +
          '<td><input type="number" min="0" step="0.1" inputmode="decimal" class="pdv-pct" value="' + it.pct + '" data-pct="' + versao + ':' + ridx + '.' + gi + '.' + i + '" aria-label="Percentual de ' + escTxt(it.nome) + '"></td>' +
          '<td>' + fmtG(v) + '</td></tr>';
      });
      h += '<tr class="sub"><td>Subtotal</td><td>' + fmtPct(subPct) + '</td><td>' + fmtG(sub) + '</td></tr>';
      h += '</tbody></table>';
      if (isPre) h += '<div class="pdv-pre-note">➜ Este pré-fermento entra na massa principal</div>';
    });
    return h;
  }
  function htmlReceitas(recs, rstate, base, versao) {
    base = base || 0;
    var h = '';
    recs.forEach(function (r, idx) {
      var i0 = base + idx;
      var st = rstate[i0];
      var f = (st.qtd * st.peso) / somaPct(r.grupos);
      h += '<div class="pdv-receita">' +
        '<div class="pdv-receita-top"><h5>' + escTxt(r.nome) + '</h5><span class="pdv-receita-nota">' + escTxt(r.nota) + '</span></div>' +
        '<div class="pdv-receita-ctrl">' +
          '<label>Nº de ' + escTxt(r.unidadePlural) + ' <button type="button" data-rqtd="' + i0 + '" data-d="-1" aria-label="Diminuir">−</button><input type="number" min="1" inputmode="numeric" value="' + st.qtd + '" data-rqtd="' + i0 + '" aria-label="Número de ' + escTxt(r.unidadePlural) + '"><button type="button" data-rqtd="' + i0 + '" data-d="1" aria-label="Aumentar">+</button></label>' +
          '<label>Peso de cada ' + escTxt(r.unidade) + ' <input type="number" min="1" step="0.1" inputmode="decimal" value="' + st.peso + '" data-peso="' + i0 + '" aria-label="Peso de cada ' + escTxt(r.unidade) + '"> g</label>' +
        '</div>' +
        '<p class="pdv-receita-resumo">Peso total ≈ ' + fmtG(st.qtd * st.peso) + ' g · farinha ≈ ' + fmtG(100 * f) + ' g (100%)</p>' +
        '<p class="pdv-receita-hint">Aumente o nº de ' + escTxt(r.unidadePlural) + ' mantendo o peso de cada um, ou aumente o peso de cada ' + escTxt(r.unidade) + ' para crescer a farinha (100%).</p>' +
        htmlGrupos(r, f, i0, versao) +
      '</div>';
    });
    return h;
  }

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
    return { startAt: 0, alertados: {}, dobras: {}, ing: {}, sel: null, pct: {}, aba: 'timer' };
  }

  function defaultSel(receitasDef) {
    if (!receitasDef) return { ridx: 0, vk: 'biologica' };
    for (var i = 0; i < receitasDef.receitas.length; i++) {
      var vks = Object.keys(receitasDef.receitas[i].versoes || {});
      for (var j = 0; j < vks.length; j++) {
        if (versaoValida(receitasDef.receitas[i].base, vks[j])) return { ridx: i, vk: vks[j] };
      }
    }
    return { ridx: 0, vk: 'biologica' };
  }

  function montar(el, cursoKey, receita, metodo, cfg) {
    cfg = cfg || {};
    ttsCfg.url = cfg.endpoint || '';
    ttsCfg.on = !!(cfg.tts && ttsCfg.url);
    var metodoS = sanitizarMetodo(metodo);
    var marcos = montarMarcos(metodoS);
    var st = lerState(cursoKey) || novoState();
    if (!st.pct) st.pct = {};
    var receitasDef = RECEITAS[cursoKey];
    var passos = (receita && receita.passos) || PASSOS_PADRAO;
    var rstate = [];
    if (receitasDef) {
      receitasDef.receitas.forEach(function (r) { rstate.push({ qtd: r.qtdPadrao || 1, peso: r.pesoPadrao || 0 }); });
    }
    var sel = st.sel;
    if (!sel || !receitasDef || sel.ridx >= receitasDef.receitas.length || !receitasDef.receitas[sel.ridx].versoes[sel.vk]) {
      sel = defaultSel(receitasDef);
    }
    var timer = null;

    el.innerHTML =
      '<div class="pdv-metodo">' +
        '<div class="pdv-tabs" role="tablist">' +
          '<button type="button" class="pdv-tab on" data-tab="timer" role="tab">⏱ Timer</button>' +
          '<button type="button" class="pdv-tab" data-tab="receitas" role="tab">🥖 Receitas</button>' +
        '</div>' +
        '<div class="pdv-view" data-view="timer">' +
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
          '<div class="pdv-bloco pdv-dobras"><h4>Dobras</h4><ul></ul><p class="pdv-dica" data-role="dica"></p></div>' +
          '<button type="button" class="pdv-start" data-role="start">Começar</button>' +
          '<button type="button" class="pdv-testar" data-role="testar">🔔 Testar som e aviso</button>' +
          '<p class="pdv-som-status" data-role="somstatus" hidden></p>' +
        '</div>' +
        '<div class="pdv-view" data-view="receitas" hidden>' +
          '<div class="pdv-metodo-top"><h3>Receitas</h3></div>' +
          '<div class="pdv-rec-chips" data-role="chips"></div>' +
          '<div class="pdv-rec-chips" data-role="vers" hidden></div>' +
          '<div class="pdv-receitas" data-role="receitas"></div>' +
        '</div>' +
      '</div>';

    var q = function (sel) { return el.querySelector(sel); };

    var boxRec = q('[data-role="receitas"]');
    var boxChips = q('[data-role="chips"]');
    var boxVers = q('[data-role="vers"]');
    function primeiraVersao(r) {
      var vks = Object.keys(r.versoes || {});
      for (var j = 0; j < vks.length; j++) if (versaoValida(r.base, vks[j])) return vks[j];
      return vks[0] || 'biologica';
    }
    function renderChips() {
      if (!receitasDef) { boxChips.innerHTML = ''; return; }
      var h = '';
      if (receitasDef.label) h += '<div class="pdv-rec-label">' + escTxt(receitasDef.label) + '</div>';
      receitasDef.receitas.forEach(function (r, ridx) {
        if (!primeiraVersao(r)) return;
        h += '<button type="button" class="pdv-rec-chip' + (ridx === sel.ridx ? ' on' : '') + '" data-recup="' + ridx + '">' +
          '<span class="pdv-rec-chip-nome">' + escTxt(r.nome) + '</span>' +
        '</button>';
      });
      boxChips.innerHTML = h;
    }
    function renderVers() {
      if (!receitasDef) { boxVers.hidden = true; boxVers.innerHTML = ''; return; }
      var r = receitasDef.receitas[sel.ridx];
      var vks = Object.keys(r.versoes || {}).filter(function (vk) { return versaoValida(r.base, vk); });
      if (vks.length < 2) { boxVers.hidden = true; boxVers.innerHTML = ''; return; }
      boxVers.hidden = false;
      var h = '';
      vks.forEach(function (vk) {
        var v = r.versoes[vk];
        h += '<button type="button" class="pdv-rec-chip' + (vk === sel.vk ? ' on' : '') + '" data-ver="' + vk + '">' +
          '<span class="pdv-rec-chip-nome">' + escTxt(v.nome) + '</span>' +
          '<span class="pdv-rec-chip-fer">' + escTxt(v.fermento) + '</span>' +
        '</button>';
      });
      boxVers.innerHTML = h;
    }
    function renderReceitas() {
      if (!receitasDef) { boxRec.innerHTML = '<p class="pdv-receita-vazio">Receita disponível em breve.</p>'; return; }
      var r = receitasDef.receitas[sel.ridx];
      var h = '';
      Object.keys(r.versoes || {}).forEach(function (vk) {
        if (!versaoValida(r.base, vk)) return;
        var view = receitaView(r, vk);
        view.grupos.forEach(function (g, gi) {
          g.itens.forEach(function (it, i) {
            var k = vk + ':' + sel.ridx + '.' + gi + '.' + i;
            var ov = st.pct[k];
            if (ov != null) it.pct = ov;
          });
        });
        h += '<div class="pdv-rec-body" data-body="' + vk + '"' + (vk === sel.vk ? '' : ' hidden') + '>' +
          htmlReceitas([view], rstate, sel.ridx, vk) + '</div>';
      });
      boxRec.innerHTML = h;
    }
    function mostrarVersao() {
      if (!receitasDef) return;
      Array.prototype.forEach.call(boxRec.querySelectorAll('[data-body]'), function (bd) {
        bd.hidden = bd.getAttribute('data-body') !== sel.vk;
      });
    }
    renderChips();
    renderVers();
    renderReceitas();
    boxRec.addEventListener('click', function (e) {
      var b = e.target;
      if (!b || !b.getAttribute) return;
      if (b.hasAttribute('data-rqtd') && b.hasAttribute('data-d')) {
        var idx = Number(b.getAttribute('data-rqtd'));
        var q2 = (rstate[idx].qtd || 1) + Number(b.getAttribute('data-d'));
        if (q2 < 1) q2 = 1;
        rstate[idx].qtd = q2;
        renderReceitas();
        render();
      }
    });
    boxRec.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      if (t.hasAttribute('data-rqtd')) {
        var idx = Number(t.getAttribute('data-rqtd'));
        var q2 = parseInt(t.value, 10);
        if (isNaN(q2) || q2 < 1) q2 = 1;
        rstate[idx].qtd = q2;
        renderReceitas();
        render();
      } else if (t.hasAttribute('data-peso')) {
        var idx2 = Number(t.getAttribute('data-peso'));
        var p2 = parseFloat(String(t.value).replace(',', '.'));
        if (isNaN(p2) || p2 < 1) p2 = 1;
        rstate[idx2].peso = p2;
        renderReceitas();
        render();
      } else if (t.hasAttribute('data-pct')) {
        var k = t.getAttribute('data-pct');
        var p3 = parseFloat(String(t.value).replace(',', '.'));
        if (isNaN(p3) || p3 < 0) p3 = 0;
        st.pct[k] = p3;
        salvarState(cursoKey, st);
        renderReceitas();
        render();
      }
    });

    boxChips.addEventListener('click', function (e) {
      var b = e.target;
      while (b && b !== boxChips && !b.hasAttribute) b = b.parentNode;
      if (!b || !b.hasAttribute || !b.hasAttribute('data-recup')) return;
      var ridx = Number(b.getAttribute('data-recup'));
      if (ridx === sel.ridx) return;
      sel = { ridx: ridx, vk: primeiraVersao(receitasDef.receitas[ridx]) };
      st.sel = sel;
      salvarState(cursoKey, st);
      renderChips();
      renderVers();
      renderReceitas();
      render();
    });

    boxVers.addEventListener('click', function (e) {
      var b = e.target;
      while (b && b !== boxVers && !b.hasAttribute) b = b.parentNode;
      if (!b || !b.hasAttribute || !b.hasAttribute('data-ver')) return;
      var vk = b.getAttribute('data-ver');
      if (vk === sel.vk) return;
      sel = { ridx: sel.ridx, vk: vk };
      st.sel = sel;
      salvarState(cursoKey, st);
      Array.prototype.forEach.call(boxVers.querySelectorAll('[data-ver]'), function (cb) {
        cb.classList.toggle('on', cb.getAttribute('data-ver') === sel.vk);
      });
      mostrarVersao();
    });

    function setTab(tab) {
      st.aba = tab;
      salvarState(cursoKey, st);
      Array.prototype.forEach.call(el.querySelectorAll('[data-tab]'), function (t) {
        t.className = 'pdv-tab' + (t.getAttribute('data-tab') === tab ? ' on' : '');
      });
      Array.prototype.forEach.call(el.querySelectorAll('.pdv-view'), function (v) {
        v.hidden = v.getAttribute('data-view') !== tab;
      });
    }
    el.querySelector('.pdv-tabs').addEventListener('click', function (e) {
      var b = e.target;
      if (!b || !b.hasAttribute || !b.hasAttribute('data-tab')) return;
      setTab(b.getAttribute('data-tab'));
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
      var dica = passos[mk.tipo] || '';
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
      var dica = passos[mk.tipo] ? ' — ' + passos[mk.tipo] : '';
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
      if (prox && passos[prox.tipo]) dica.textContent = passos[prox.tipo];
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
      sel = defaultSel(receitasDef);
      limparBanner();
      renderChips();
      renderVers();
      renderReceitas();
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
    setTab(st.aba || 'timer');
    render();
  }

  registrarDesbloqueioGlobal();

  var PDVMetodo = { nucleo: nucleo, montar: montar };
  if (typeof module !== 'undefined' && module.exports) module.exports = PDVMetodo;
  root.PDVMetodo = PDVMetodo;
})(typeof window !== 'undefined' ? window : globalThis);
