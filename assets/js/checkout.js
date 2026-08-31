/* checkout.js — Pão de Verdade — página dedicada */
(function () {
  var CONFIG = (typeof PDV_CONFIG !== 'undefined') ? PDV_CONFIG : {};
  var PRECO = 275;
  var CURSO_INFO = { 'Pão': { hora: '8h às 13h' }, 'Pizza': { hora: '17h às 22h' } };
  var codigoOk = false;
  var codigoTimer = null;
  var codigoTipo = '';
  var codigoValor = 0;
  var codigoReserva = null;
  var pixTimer = null;
  var ultimoPedidoPix = null;
  var qtd = 1;
  var preCurso = '';
  var dataTurma = '';
  var vagas = null;
  var turmaNaoAberta = false;
  var pillViewSent = false;
  var pillConvSent = false;

  function qs(s, el) { return (el || document).querySelector(s); }
  function qsa(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }

  function getParam(n) {
    try { return new URLSearchParams(location.search).get(n) || ''; } catch (e) { return ''; }
  }

  function gerarCoid() {
    try {
      var a = new Uint32Array(4);
      if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
      else for (var i = 0; i < 4; i++) a[i] = Math.floor(Math.random() * 0xFFFFFFFF);
      return 'PDV-' + Array.prototype.map.call(a, function (x) { return ('00000000' + x.toString(16)).slice(-8); }).join('').toUpperCase();
    } catch (e) {
      return 'PDV-' + Date.now().toString(16).toUpperCase() + '-' + Math.random().toString(16).slice(2, 10).toUpperCase();
    }
  }

  function normalizarCPF(v) { return String(v || '').replace(/\D/g, '').slice(0, 11); }
  function formatarCPF(v) {
    var d = normalizarCPF(v);
    if (d.length !== 11) return v;
    return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
  }
  function validarCPF(v) {
    var c = normalizarCPF(v);
    if (c.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(c)) return false;
    var d1 = 0, d2 = 0;
    for (var i = 0; i < 9; i++) d1 += parseInt(c.charAt(i), 10) * (10 - i);
    d1 = (d1 * 10) % 11; if (d1 === 10) d1 = 0;
    if (d1 !== parseInt(c.charAt(9), 10)) return false;
    for (var i2 = 0; i2 < 10; i2++) d2 += parseInt(c.charAt(i2), 10) * (11 - i2);
    d2 = (d2 * 10) % 11; if (d2 === 10) d2 = 0;
    return d2 === parseInt(c.charAt(10), 10);
  }
  function maskCPF(e) {
    var v = normalizarCPF(e.target.value);
    var f = v;
    if (v.length > 9) f = v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6, 9) + '-' + v.slice(9, 11);
    else if (v.length > 6) f = v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6);
    else if (v.length > 3) f = v.slice(0, 3) + '.' + v.slice(3);
    e.target.value = f;
    validarCampoCPF(e.target);
  }
  function validarCampoCPF(input) {
    var v = input.value.trim();
    var hint = document.getElementById('hint-' + input.id);
    if (!v) { input.classList.remove('is-valid', 'is-invalid'); if (hint) { hint.textContent = ''; hint.className = 'ck-hint'; } return false; }
    if (validarCPF(v)) { input.classList.remove('is-invalid'); input.classList.add('is-valid'); if (hint) { hint.textContent = '✓ CPF válido'; hint.className = 'ck-hint ok'; } return true; }
    if (normalizarCPF(v).length === 11) { input.classList.remove('is-valid'); input.classList.add('is-invalid'); if (hint) { hint.textContent = 'CPF inválido — confira os 11 dígitos'; hint.className = 'ck-hint err'; } return false; }
    input.classList.remove('is-valid', 'is-invalid'); if (hint) { hint.textContent = ''; hint.className = 'ck-hint'; } return false;
  }
  function maskWhats(e) {
    var v = String(e.target.value).replace(/\D/g, '').slice(0, 11);
    var f = v;
    if (v.length > 10) f = '(' + v.slice(0, 2) + ') ' + v.slice(2, 7) + '-' + v.slice(7);
    else if (v.length > 6) f = '(' + v.slice(0, 2) + ') ' + v.slice(2, 6) + '-' + v.slice(6);
    else if (v.length > 2) f = '(' + v.slice(0, 2) + ') ' + v.slice(2);
    else if (v.length) f = '(' + v;
    e.target.value = f;
  }

  function pessoaBlock(i) {
    var curso = preCurso || 'Pizza';
    var info = CURSO_INFO[curso] || {};
    return '' +
      '<div class="ck-pessoa" data-pessoa="' + i + '">' +
      '<div class="ck-pessoa-title">Pessoa ' + (i + 1) + '</div>' +
      '<div class="ck-grid2">' +
      '<div class="ck-field"><label for="ckNome' + i + '">Nome completo <span class="ck-req">*</span></label><input type="text" id="ckNome' + i + '" autocomplete="name" required placeholder="Ex.: Maria Silva"></div>' +
      '<div class="ck-field"><label for="ckCpf' + i + '">CPF <span class="ck-req">*</span> <span class="ck-info" title="Para emissão do certificado e recibo">i</span></label><input type="text" id="ckCpf' + i + '" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00" maxlength="14" required><span class="ck-hint" id="hint-ckCpf' + i + '"></span></div>' +
      '</div>' +
      '<div class="ck-grid2">' +
      '<div class="ck-field"><label for="ckWhats' + i + '">WhatsApp (com DDD) <span class="ck-req">*</span></label><input type="tel" id="ckWhats' + i + '" autocomplete="tel" placeholder="(34) 99999-9999" required></div>' +
      '<div class="ck-field"><label for="ckEmail' + i + '">E-mail <span class="ck-req">*</span></label><input type="email" id="ckEmail' + i + '" autocomplete="email" placeholder="maria@email.com" required></div>' +
      '</div>' +
      '<div class="ck-field"><span class="ck-label">Curso</span>' +
      '<div class="ck-cursos">' +
      '<label class="ck-curso"><input type="checkbox" name="ckCurso' + i + '" value="' + esc(curso) + '" data-pessoa="' + i + '" checked disabled><span class="ck-curso-txt"><b>' + esc(curso) + '</b><small>' + (info.hora || '') + ' · R$ 275</small></span></label>' +
      '</div></div>' +
      '</div>';
  }

  function lerPessoas() {
    var n = qtd;
    var out = [];
    for (var i = 0; i < n; i++) {
      var cursos = qsa('input[name="ckCurso' + i + '"]:checked').map(function (el) { return el.value; });
      if (!cursos.length && preCurso) cursos = [preCurso];
      out.push({
        nome: (qs('#ckNome' + i) ? qs('#ckNome' + i).value.trim() : ''),
        cpf: normalizarCPF(qs('#ckCpf' + i) ? qs('#ckCpf' + i).value : ''),
        whatsapp: (qs('#ckWhats' + i) ? qs('#ckWhats' + i).value.trim() : ''),
        email: (qs('#ckEmail' + i) ? qs('#ckEmail' + i).value.trim() : ''),
        cursos: cursos
      });
    }
    return out;
  }

  function totalPessoas() {
    var pessoas = lerPessoas();
    var itens = 0;
    pessoas.forEach(function (p) { itens += (p.cursos || []).length; });
    var bruto = itens * PRECO;
    var desconto = 0;
    if (codigoOk) {
      if (codigoTipo === 'reserva') desconto = Math.round(bruto * codigoValor / 100 * 100) / 100;
      else if (codigoTipo === 'valor') desconto = Math.min(codigoValor, bruto);
      else if (codigoTipo === 'pct') desconto = Math.round(bruto * codigoValor / 100 * 100) / 100;
      else desconto = Math.round(bruto * 0.15 * 100) / 100;
    } else {
      desconto = itens >= 2 ? Math.round(bruto * 0.15 * 100) / 100 : 0;
    }
    var total = Math.round((bruto - desconto) * 100) / 100;
    return { itens: itens, bruto: bruto, desconto: desconto, total: total, pessoas: pessoas };
  }

  function atualizarResumo() {
    var t = totalPessoas();
    var el = qs('#ckResumo');
    var inline = qs('#ckInlineResumo');
    var btnCont = qs('#ckBtnContinuar');
    if (el) {
      if (t.itens === 0) {
        el.innerHTML = '<p class="ck-hint">Selecione ao menos um curso para cada pessoa.</p>';
      } else {
        var linhas = '';
        t.pessoas.forEach(function (p, idx) {
          (p.cursos || []).forEach(function (c) {
            var hora = CURSO_INFO[c] ? CURSO_INFO[c].hora : '';
            linhas += '<div class="ck-resumo-linha"><span>P' + (idx + 1) + ' · ' + c + (hora ? ' ' + hora : '') + '</span><span>R$ ' + PRECO.toFixed(2) + '</span></div>';
          });
        });
        var descLabel = codigoOk ? (codigoTipo === 'reserva' && codigoValor > 0 ? 'Desconto reservado (' + codigoValor + '%)' : 'Desconto (código)') : 'Desconto dupla/2 cursos (15%)';
        linhas += '<div class="ck-resumo-linha"><span>Subtotal (' + t.itens + ' itens)</span><span>R$ ' + t.bruto.toFixed(2) + '</span></div>';
        if (t.desconto > 0) linhas += '<div class="ck-resumo-linha ck-resumo-desc"><span>' + descLabel + '</span><span>− R$ ' + t.desconto.toFixed(2) + '</span></div>';
        linhas += '<div class="ck-resumo-total"><span>Total</span><span>R$ ' + t.total.toFixed(2) + '</span></div>';
        el.innerHTML = linhas;
      }
    }
    if (inline) {
      if (t.itens === 0) {
        inline.innerHTML = '<p class="ck-hint">Selecione cursos para ver o total.</p>';
        inline.classList.remove('has-content');
      } else {
        var mini = '<div class="ck-resumo-linha"><span>' + t.itens + ' itens</span><span>R$ ' + t.bruto.toFixed(2) + '</span></div>';
        if (t.desconto > 0) mini += '<div class="ck-resumo-linha ck-resumo-desc"><span>−15%</span><span>− R$ ' + t.desconto.toFixed(2) + '</span></div>';
        mini += '<div class="ck-resumo-total"><span>Total</span><span>R$ ' + t.total.toFixed(2) + '</span></div>';
        inline.innerHTML = mini;
        inline.classList.add('has-content');
      }
    }
    if (btnCont) btnCont.textContent = t.itens >= 1 ? (t.total <= 0 ? 'Confirmar vaga (grátis) →' : 'Continuar — R$ ' + t.total.toFixed(2) + ' →') : 'Continuar →';
    var btn = qs('#ckBtnPagar');
    if (btn) btn.textContent = t.itens >= 1 ? (t.total <= 0 ? 'Confirmar vaga grátis →' : 'Pagar R$ ' + t.total.toFixed(2) + ' →') : 'Pagar agora';
    atualizarVagasUI();
  }

  /* ---- VAGAS (10 por turma) ----
     Contador ao vivo + bloqueio de dupla quando não cabe + lista de espera. */
  function bloquearCheckout() {
    var main = qs('.checkout-main');
    if (!main) return;
    main.innerHTML = '<div class="ck-bloqueio">' +
      '<h1>Inscrições encerradas</h1>' +
      '<p class="ck-panel-sub">Esta turma não está mais à venda. A próxima oficina abre em breve — entre na lista de espera para ser avisado(a).</p>' +
      '<a class="btn btn-primary btn-lg" style="width:100%" href="agenda.html">Entrar na lista de espera →</a>' +
      '<p class="ck-hint" style="text-align:center;margin-top:12px">Dúvidas? <a href="https://wa.me/' + esc(CONFIG.WHATSAPP || '') + '" target="_blank" rel="noopener">Fale no WhatsApp</a></p>' +
      '</div>';
    var prog = qs('.checkout-progress');
    if (prog) prog.style.display = 'none';
  }

  function carregarVagas() {
    chamar('acao=turmas', function (res) {
      if (!res || !Array.isArray(res)) return;
      var ativa = false;
      res.forEach(function (t) {
        if (t.dataTurma === dataTurma && norm(t.curso) === norm(preCurso)) ativa = true;
      });
      if (preCurso && !ativa) { bloquearCheckout(); return; }
      vagas = {};
      turmaNaoAberta = false;
      res.forEach(function (t) { if (t.dataTurma === dataTurma) vagas[t.curso] = t; });
      var temTurma = Object.keys(vagas).length > 0;
      if (!temTurma) turmaNaoAberta = true;
      atualizarVagasUI();
    });
  }

  function vagasStatus() {
    if (turmaNaoAberta) return null;
    if (!vagas) return null;
    var cursos = {};
    lerPessoas().forEach(function (p) { (p.cursos || []).forEach(function (c) { cursos[c] = (cursos[c] || 0) + 1; }); });
    var nomes = Object.keys(cursos);
    if (!nomes.length) return null;
    return nomes.map(function (c) {
      var t = vagas[c];
      if (!t) return null;
      var need = cursos[c];
      var rest = Number(t.restantes) || 0;
      var cap = Number(t.vagas) || 10;
      var occ = Number(t.ocupadas);
      if (isNaN(occ)) occ = Math.max(0, cap - rest);
      var temReserva = !!(codigoReserva &&
        norm(c) === norm(codigoReserva.curso) &&
        norm(dataTurma) === norm(codigoReserva.dataTurma));
      if (temReserva) rest += Number(codigoReserva.vagas) || 1;
      return { curso: c, need: need, rest: rest, cap: cap, occ: occ, cheia: rest <= 0, cabe: rest >= need, reserva: temReserva };
    }).filter(Boolean);
  }

  function norm(s) {
    return String(s || '').trim().toLowerCase()
      .replace(/[àáâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
      .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c');
  }

  function stripVagas(s) {
    var cap = s.cap || 10;
    var occ = s.occ;
    if (occ == null) occ = Math.max(0, cap - s.rest);
    if (s.reserva) {
      return '<div class="ck-vagas" role="status"><p class="ck-vagas-garantia" style="font-weight:700">✓ Vaga reservada para você — liberada pelo seu link.</p></div>';
    }
    if (!s.cheia && s.cabe && s.rest > (CONFIG.VAGAS_ALERTA || 5)) return '';
    var segs = '';
    for (var i = 0; i < cap; i++) segs += '<span class="seg' + (i < occ ? ' on' : '') + '"></span>';
    if (s.cheia) {
      return '<div class="ck-vagas" role="status"><p class="ck-vagas-cheia">TURMA LOTADA — ' + esc(s.curso) + '</p></div>';
    }
    if (!s.cabe) {
      return '<div class="ck-vagas" role="status">' +
        '<div class="ck-vagas-bar" aria-hidden="true">' + segs + '</div>' +
        '<p class="ck-vagas-warn">' + esc(s.curso) + ': restam ' + s.rest + ' vaga' + (s.rest === 1 ? '' : 's') +
        ' e sua compra inclui ' + s.need + ' — não cabe.</p></div>';
    }
    var status = s.rest <= 3 ? '<span class="ck-vagas-status">Restam ' + s.rest + '</span>' : '';
    return '<div class="ck-vagas" role="status" aria-live="polite" aria-label="' +
      occ + ' de ' + cap + ' vagas ocupadas na turma de ' + esc(s.curso) + '">' +
      '<div class="ck-vagas-bar" aria-hidden="true">' + segs + '</div>' +
      '<p class="ck-vagas-txt"><strong>' + occ + ' de ' + cap + '</strong> vagas ocupadas nesta turma' + status + '</p>' +
      '<p class="ck-vagas-garantia">Sua vaga fica reservada por 30 min para o pagamento.</p></div>';
  }

  function beaconPillView() {
    if (pillViewSent) return;
    var track = window.PDV_Track;
    if (!track) return;
    var st = vagasStatus();
    if (!st || !st.length) return;
    pillViewSent = true;
    st.forEach(function (s) {
      track('pill_view', [s.curso, dataTurma, s.occ, s.rest, s.cap].join('|'));
    });
  }

  function beaconPillConv() {
    if (pillConvSent) return;
    var track = window.PDV_Track;
    if (!track) return;
    pillConvSent = true;
    var cursos = [];
    if (preCurso) cursos.push(preCurso);
    else {
      var seen = {};
      lerPessoas().forEach(function (p) {
        (p.cursos || []).forEach(function (c) { if (!seen[c]) { seen[c] = 1; cursos.push(c); } });
      });
    }
    cursos.forEach(function (c) { track('pill_conv', c + '|' + dataTurma); });
  }

  function atualizarVagasUI() {
    var el = qs('#ckVagasInfo');
    if (!el) return;
    if (turmaNaoAberta) {
      el.innerHTML = '<div class="ck-vagas" role="status"><p class="ck-vagas-cheia">Turma não está aberta (' + esc(dataTurma) + ') — a vaga só é garantida quando a data for anunciada. <a href="agenda.html" style="text-decoration:underline;font-weight:700">Entrar na lista de espera na agenda →</a></p></div>';
      var btnPag = qs('#ckBtnPagar');
      if (btnPag) btnPag.disabled = true;
      beaconPillView();
      return;
    }
    var st = vagasStatus();
    if (!st) { el.innerHTML = ''; return; }
    var html = '';
    st.forEach(function (s) { html += stripVagas(s); });
    el.innerHTML = html;
    var bloqueado = st.filter(function (s) { return s.cheia || !s.cabe; });
    var link = qs('#ckEsperaLink');
    if (bloqueado.length) {
      if (!link) {
        var a = document.createElement('a');
        a.id = 'ckEsperaLink';
        a.href = 'agenda.html';
        a.style.cssText = 'display:block;margin-top:6px;font-weight:700;text-decoration:underline;color:#4A2E1B;cursor:pointer';
        a.textContent = 'Entrar na lista de espera →';
        el.appendChild(a);
      }
    } else if (link) {
      link.parentNode.removeChild(link);
    }
    beaconPillView();
  }

  function bloqueioVagas() {
    var st = vagasStatus();
    return st ? st.filter(function (s) { return s.cheia || !s.cabe; }) : null;
  }

  function setQtd(n) {
    qtd = n;
    qsa('.ck-qtd-btn').forEach(function (b) { b.classList.toggle('is-active', parseInt(b.getAttribute('data-qtd'), 10) === n); });
    // preserva valores
    var prev = lerPessoas();
    var box = qs('#ckPessoas');
    if (!box) return;
    box.innerHTML = pessoaBlock(0) + (n === 2 ? pessoaBlock(1) : '');
    // restaura
    for (var i = 0; i < Math.min(prev.length, n); i++) {
      if (qs('#ckNome' + i)) qs('#ckNome' + i).value = prev[i].nome || '';
      if (qs('#ckCpf' + i)) qs('#ckCpf' + i).value = prev[i].cpf ? formatarCPF(prev[i].cpf) : '';
      if (qs('#ckWhats' + i)) qs('#ckWhats' + i).value = prev[i].whatsapp || '';
      if (qs('#ckEmail' + i)) qs('#ckEmail' + i).value = prev[i].email || '';
      // cursos
      (prev[i].cursos || []).forEach(function (c) {
        var cb = qs('input[name="ckCurso' + i + '"][value="' + c + '"]');
        if (cb) cb.checked = true;
      });
    }
    bindPessoaEvents();
    atualizarResumo();
  }

  function bindPessoaEvents() {
    qsa('[id^="ckCpf"]').forEach(function (el) {
      el.addEventListener('input', maskCPF);
      el.addEventListener('blur', function (e) { validarCampoCPF(e.target); });
    });
    qsa('[id^="ckWhats"]').forEach(function (el) {
      el.addEventListener('input', maskWhats);
    });
    qsa('[id^="ckNome"], [id^="ckEmail"]').forEach(function (el) {
      el.addEventListener('input', atualizarResumo);
    });
    document.addEventListener('change', function (e) {
      if (e.target.name && e.target.name.indexOf('ckCurso') === 0) atualizarResumo();
    });
  }

  function goStep(n) {
    if (n === 2) {
      // valida etapa 1
      var pessoas = lerPessoas();
      for (var i = 0; i < pessoas.length; i++) {
        var p = pessoas[i];
        if (!p.nome || !p.email) { mostrarErro('Preencha nome e e-mail de todas as pessoas.'); scrollToTop(); return; }
        if (!p.cpf || !validarCPF(p.cpf)) { mostrarErro('CPF inválido para ' + (p.nome || ('pessoa ' + (i + 1))) + '.'); var inp = qs('#ckCpf' + i); if (inp) { inp.classList.add('is-invalid'); inp.focus(); } scrollToTop(); return; }
        if (!p.whatsapp) { mostrarErro('Preencha o WhatsApp de todas as pessoas.'); scrollToTop(); return; }
        if (!p.cursos.length) { mostrarErro('Selecione ao menos um curso para cada pessoa.'); scrollToTop(); return; }
      }
      limparErro();
    }
    qsa('.ck-panel').forEach(function (p) { p.classList.remove('is-active'); });
    var target = qs('#ckStep' + n);
    if (target) target.classList.add('is-active');
    qsa('.ck-step').forEach(function (s) {
      var sn = parseInt(s.getAttribute('data-step'), 10);
      s.classList.toggle('is-active', sn === n);
      s.classList.toggle('is-done', sn < n);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function mostrarErro(msg) {
    var el = qs('#ckErro');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }
  function erroComEspera(msg) {
    var el = qs('#ckErro');
    if (!el) return;
    el.hidden = false;
    el.innerHTML = esc(msg) + ' <a href="agenda.html" style="font-weight:700;text-decoration:underline">Entrar na lista de espera na agenda →</a>';
  }
  function limparErro() {
    var el = qs('#ckErro');
    if (el) { el.hidden = true; el.textContent = ''; }
  }
  function mostrarFalhaPagamento(msg) {
    var el = qs('#ckErro');
    if (!el) return;
    el.hidden = false;
    el.innerHTML = esc(msg || 'Falha de conexão. Tente novamente.') + ' ' +
      '<a href="https://wa.me/' + esc(CONFIG.WHATSAPP || '') + '?text=' + encodeURIComponent('Oi! Estou tentando garantir minha vaga nas oficinas e o pagamento online falhou. Quero concluir minha inscrição.') + '" target="_blank" rel="noopener" style="font-weight:700;text-decoration:underline">Concluir pelo WhatsApp</a>';
  }

  function chamar(params, cb, errCb) {
    var base = (CONFIG.WEB_APP_URL || '').trim();
    if (!base || base.indexOf('COLE_AQUI') !== -1) {
      (errCb || cb)({ ok: false, erro: 'Inscrição online ainda não configurada.' });
      return;
    }
    var tentou = 0;
    function tenta() {
      var id = 'ckCb' + Date.now() + Math.floor(Math.random() * 1000);
      var done = false;
      var s = document.createElement('script');
      s.id = id;
      window[id] = function (res) {
        if (done) return;
        done = true;
        try { delete window[id]; } catch (e) { window[id] = undefined; }
        if (s.parentNode) s.parentNode.removeChild(s);
        cb(res);
      };
      s.onerror = function () {
        if (done) return;
        done = true;
        try { delete window[id]; } catch (e2) { window[id] = undefined; }
        if (s.parentNode) s.parentNode.removeChild(s);
        if (tentou === 0) { tentou++; return tenta(); }
        (errCb || cb)({ ok: false, erro: 'Falha de conexão. Tente novamente.' });
      };
      s.src = base + (base.indexOf('?') === -1 ? '?' : '&') + params + '&callback=' + id;
      document.body.appendChild(s);
      setTimeout(function () {
        if (done) return;
        done = true;
        try { delete window[id]; } catch (e3) { window[id] = undefined; }
        if (s.parentNode) s.parentNode.removeChild(s);
        if (tentou === 0) { tentou++; return tenta(); }
        (errCb || cb)({ ok: false, erro: 'Tempo esgotado. Tente novamente.' });
      }, 25000);
    }
    tenta();
  }

  function toggleCodigo() {
    var wrap = qs('#ckCodigoWrap');
    var btn = qs('#ckCodigoToggle');
    if (!wrap) return;
    var isHidden = wrap.hasAttribute('hidden');
    if (isHidden) { wrap.removeAttribute('hidden'); if (btn) btn.textContent = 'Código de desconto'; var inp = qs('#ckCodigo'); if (inp) inp.focus(); }
    else { wrap.setAttribute('hidden', ''); if (btn) btn.textContent = 'Tem código de desconto? Clique aqui'; }
  }
  function validarCodigoCliente() {
    var input = qs('#ckCodigo');
    var hint = qs('#ckCodigoHint');
    if (!input || !hint) return;
    var v = input.value.trim().toUpperCase();
    if (!v) { codigoOk = false; codigoTipo = ''; codigoValor = 0; codigoReserva = null; hint.textContent = ''; hint.className = 'ck-code-hint'; atualizarResumo(); return; }
    hint.textContent = 'Validando…';
    hint.className = 'ck-code-hint';
    chamar('acao=validarcodigo&codigo=' + encodeURIComponent(v), function (res) {
      if (res && res.ok) {
        codigoOk = true;
        codigoTipo = res.tipo || '';
        codigoValor = Number(res.valor || 0);
        codigoReserva = res.tipo === 'reserva' ? (res.reserva || null) : null;
        hint.textContent = res.msg || '✓ Código válido! Desconto aplicado.';
        hint.className = 'ck-code-hint ok';
      } else {
        codigoOk = false;
        codigoTipo = '';
        codigoValor = 0;
        codigoReserva = null;
        hint.textContent = (res && res.erro) || 'Código inválido.';
        hint.className = 'ck-code-hint err';
      }
      atualizarResumo();
    }, function () {
      codigoOk = false;
      codigoTipo = '';
      codigoValor = 0;
      codigoReserva = null;
      hint.textContent = 'Não foi possível validar agora.';
      hint.className = 'ck-code-hint err';
      atualizarResumo();
    });
  }

  function radioPagamentos() {
    var box = qs('#ckPagamentos');
    if (!box) return;
    var lista = CONFIG.PAGAMENTOS || ['pixmp', 'cartao'];
    var labels = { 'pixmp': 'Pix', 'cartao': 'Cartão de crédito' };
    var html = '';
    lista.forEach(function (m, idx) {
      var lab = labels[m] || m;
      html += '<label class="ck-radio"><input type="radio" name="ckPagamento" value="' + m + '"' + (idx === 0 ? ' checked' : '') + '><strong>' + lab + '</strong></label>';
    });
    box.innerHTML = html;
  }

  function enviar() {
    limparErro();
    var pessoas = lerPessoas();
    for (var i = 0; i < pessoas.length; i++) {
      var p = pessoas[i];
      if (!p.nome || !p.email || !p.cpf || !p.whatsapp || !p.cursos.length) {
        mostrarErro('Preencha todos os campos obrigatórios (*) de cada pessoa.');
        goStep(1);
        return;
      }
      if (!validarCPF(p.cpf)) { mostrarErro('CPF inválido para ' + p.nome + '.'); goStep(1); return; }
    }
    var metodo = (qs('input[name="ckPagamento"]:checked') || {}).value || 'pixmp';
    var codigo = (qs('#ckCodigo') ? qs('#ckCodigo').value.trim() : '');
    var t = totalPessoas();
    var btn = qs('#ckBtnPagar');
    if (btn) { btn.disabled = true; btn.textContent = 'Processando…'; }
    if (turmaNaoAberta) {
      erroComEspera('Turma não está aberta — a vaga só é garantida quando a data for anunciada.');
      chamar('acao=log&tipo=turma_nao_aberta&detalhe=' + encodeURIComponent(dataTurma), function () {});
      if (btn) { btn.disabled = false; atualizarResumo(); }
      return;
    }
    var blk = bloqueioVagas();
    if (blk && blk.length) {
      var b0 = blk[0];
      var msgB = b0.cheia
        ? 'TURMA LOTADA — ' + b0.curso + ' (' + dataTurma + '). '
        : 'Só restam ' + b0.rest + ' vaga' + (b0.rest === 1 ? '' : 's') + ' em ' + b0.curso + ' e sua compra inclui ' + b0.need + ' — a dupla não cabe. ';
      erroComEspera(msgB + 'Garanta 1 pessoa ou escolha outra data.');
      chamar('acao=log&tipo=turma_cheia&detalhe=' + encodeURIComponent(b0.curso), function () {});
      if (btn) { btn.disabled = false; atualizarResumo(); }
      return;
    }
    if (window.PDV_Track) window.PDV_Track('click_pagar', 1);
    var params = 'acao=criarpedido' +
      '&pessoas=' + encodeURIComponent(JSON.stringify(pessoas)) +
      '&dataTurma=' + encodeURIComponent(dataTurma) +
      '&metodo=' + encodeURIComponent(metodo) +
      '&valor=' + encodeURIComponent(String(t.total));
    if (codigo) params += '&codigo=' + encodeURIComponent(codigo);
    // idempotência: mesmo cart reutiliza o mesmo client_order_id em retries
    var cartKey = JSON.stringify({ p: pessoas, d: dataTurma, m: metodo, c: codigo, t: t.total });
    var coid = null, savedKey = null;
    try { coid = sessionStorage.getItem('pdv_coid'); savedKey = sessionStorage.getItem('pdv_cartkey'); } catch (e) {}
    if (!coid || savedKey !== cartKey) {
      coid = gerarCoid();
      try { sessionStorage.setItem('pdv_coid', coid); sessionStorage.setItem('pdv_cartkey', cartKey); } catch (e2) {}
    }
    params += '&client_order_id=' + encodeURIComponent(coid);
    chamar(params, function (res) {
      if (btn) { btn.disabled = false; atualizarResumo(); }
      if (res && (res.creditado || res.status === 'pago')) { mostrarAprovado(); return; }
      if (!res || !res.ok) {
        var eMsg = (res && res.erro) || 'Não foi possível criar o pedido. Tente novamente.';
        if (res && (res.turma_cheia || res.turma_nao_aberta)) {
          erroComEspera(eMsg);
          return;
        }
        if (/conex|tempo|falha|erro/i.test(eMsg)) mostrarFalhaPagamento(eMsg);
        else mostrarErro(eMsg);
        return;
      }
      if (res.duplicado) {
        var elDup = qs('#ckErro');
        if (elDup) {
          elDup.hidden = false;
          elDup.innerHTML = 'Seu pedido <b>' + esc(res.pedido || '') + '</b> já foi criado' +
            (String(res.status) === 'pago' ? ' e está pago — os acessos já foram enviados por e-mail.' : '. Se você já pagou, aguarde a confirmação por e-mail.') + ' ' +
            '<a href="https://wa.me/' + esc(CONFIG.WHATSAPP || '') + '?text=' + encodeURIComponent('Oi! Meu pedido ' + (res.pedido || '') + ' já foi criado e preciso de ajuda.') + '" target="_blank" rel="noopener" style="font-weight:700;text-decoration:underline">Falar no WhatsApp</a>';
        }
        return;
      }
      if (metodo === 'cartao' && res.url) { window.location.href = res.url; return; }
      if ((metodo === 'pixmp' || metodo === 'pix_mp') && res.qr) { mostrarPixMP(res); return; }
      mostrarPixManual(res);
    }, function (e) {
      if (btn) { btn.disabled = false; atualizarResumo(); }
      mostrarFalhaPagamento((e && e.erro) || 'Falha de conexão. Tente novamente.');
    });
  }

  function mostrarPixManual(res) {
    var main = qs('.checkout-main');
    var form = qs('#checkoutForm');
    var succ = qs('#ckSuccess');
    if (form) form.hidden = true;
    qsa('.ck-step').forEach(function (s) { s.classList.add('is-done'); s.classList.remove('is-active'); });
    var total = (res && res.total != null) ? Number(res.total).toFixed(2) : totalPessoas().total.toFixed(2);
    succ.hidden = false;
    succ.innerHTML = '' +
      '<h2>Sua vaga está reservada!</h2>' +
      '<p class="ck-panel-sub">Para confirmar, faça um Pix de <strong>R$ ' + total + '</strong> para:</p>' +
      '<div style="background:var(--accent-soft);border:1.5px dashed var(--accent);border-radius:12px;padding:20px;text-align:center;margin:16px 0">' +
      '<div style="font-family:var(--serif);font-size:1.35rem;font-weight:700;letter-spacing:.04em;color:var(--accent)">' + esc(CONFIG.PIX_KEY || '') + '</div>' +
      '<div style="font-size:.92rem;margin-top:4px">' + esc(CONFIG.PIX_NOME || '') + '</div>' +
      '<div style="font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--text-soft);margin-top:8px">Chave Pix (CNPJ)</div></div>' +
      '<a class="btn btn-primary btn-lg" style="width:100%" href="https://wa.me/' + esc(CONFIG.WHATSAPP || '') + '?text=' + encodeURIComponent('Oi! Acabei de reservar minha vaga. Vou enviar o comprovante Pix de R$ ' + total) + '" target="_blank" rel="noopener">Enviar comprovante no WhatsApp</a>' +
      '<p class="ck-hint" style="text-align:center;margin-top:12px">Assim que confirmarmos, cada pessoa recebe o acesso à Área do Estudante por e-mail (confira o spam).</p>';
    // esconde resumo? mantém
  }

  function guardarPix(res) {
    try {
      sessionStorage.setItem('pdv_pix', JSON.stringify({ pedido: res.pedido, qr: res.qr, copia: res.copia, total: res.total }));
    } catch (e) {}
  }
  function limparPix() {
    try { sessionStorage.removeItem('pdv_pix'); } catch (e) {}
  }
  function pixAprovado() {
    beaconPillConv();
    clearInterval(pixTimer);
    limparPix();
    var st = qs('#ckPixStatus');
    if (st) st.textContent = '✓ Pagamento confirmado! Cada pessoa receberá o acesso por e-mail.';
    setTimeout(function () { window.location.href = 'aluno.html'; }, 1500);
  }
  function checkPix() {
    if (!ultimoPedidoPix) return;
    chamar('acao=statuspedido&pedido=' + encodeURIComponent(ultimoPedidoPix), function (r) {
      if (r && r.status === 'approved') pixAprovado();
    });
  }
  function startPixPolling(pedidoId) {
    clearInterval(pixTimer);
    var tentativas = 0;
    var maxTent = 60;
    pixTimer = setInterval(function () {
      tentativas++;
      if (tentativas > maxTent) {
        clearInterval(pixTimer);
        var st = qs('#ckPixStatus');
        if (st) {
          st.innerHTML = 'Se o pagamento não confirmar, fale conosco no <a href="https://wa.me/' + esc(CONFIG.WHATSAPP || '') + '" target="_blank" rel="noopener" style="font-weight:700;text-decoration:underline">WhatsApp</a>.';
        }
        return;
      }
      checkPix();
    }, 5000);
  }

  function mostrarPixMP(res) {
    var form = qs('#checkoutForm');
    var succ = qs('#ckSuccess');
    if (form) form.hidden = true;
    qsa('.ck-step').forEach(function (s) { s.classList.add('is-done'); });
    var total = (res && res.total != null) ? Number(res.total).toFixed(2) : totalPessoas().total.toFixed(2);
    ultimoPedidoPix = res.pedido;
    guardarPix(res);
    succ.hidden = false;
    succ.innerHTML = '' +
      '<h2>Pague com Pix</h2>' +
      '<p class="ck-panel-sub">Escaneie o QR code ou use o copia e cola. Valor: <strong>R$ ' + total + '</strong></p>' +
      '<div style="margin:18px 0"><img src="data:image/png;base64,' + esc(res.qr || '') + '" alt="QR Code Pix" style="display:block;margin:0 auto;width:220px;height:220px;border-radius:12px;border:1px solid var(--line)"></div>' +
      '<div style="background:#fff;border:1.5px solid var(--line);border-radius:12px;padding:14px"><button type="button" class="btn btn-outline" style="width:100%" onclick="navigator.clipboard.writeText(' + JSON.stringify(res.copia || '') + ').then(function(){alert(\'Código Pix copiado!\')})">Copiar código Pix</button><p style="margin-top:10px;font-size:.78rem;color:var(--text-soft);word-break:break-all">' + esc(res.copia || '') + '</p></div>' +
      '<p class="ck-hint" id="ckPixStatus" style="text-align:center;margin-top:14px;font-weight:700">Aguardando pagamento…</p>' +
      '<button type="button" class="btn btn-outline" style="width:100%;margin-top:12px" onclick="Checkout.verificarPix()">Já paguei? Verificar pagamento</button>';
    startPixPolling(res.pedido);
  }

  function mostrarAprovado() {
    beaconPillConv();
    clearInterval(pixTimer);
    limparPix();
    var form = qs('#checkoutForm');
    var succ = qs('#ckSuccess');
    if (form) form.hidden = true;
    qsa('.ck-step').forEach(function (s) { s.classList.add('is-done'); });
    succ.hidden = false;
    succ.innerHTML = '' +
      '<h2>✓ Pagamento confirmado!</h2>' +
      '<p class="ck-panel-sub">Cada pessoa receberá o acesso à Área do Estudante por e-mail.</p>' +
      '<p class="ck-hint" style="text-align:center">Se não chegar em alguns minutos, confira o spam ou <a href="https://wa.me/' + esc(CONFIG.WHATSAPP || '') + '" target="_blank" rel="noopener" style="font-weight:700;text-decoration:underline">fale no WhatsApp</a>.</p>';
  }

  function mostrarPagamentoNaoAprovado(tipo) {
    var form = qs('#checkoutForm');
    var succ = qs('#ckSuccess');
    if (form) form.hidden = true;
    succ.hidden = false;
    var msg = tipo === 'recusado' ? 'O pagamento não foi aprovado.' : 'O pagamento ficou pendente.';
    succ.innerHTML = '' +
      '<h2>' + esc(msg) + '</h2>' +
      '<p class="ck-panel-sub">Nenhum valor foi cobrado. Você pode tentar de novo.</p>' +
      '<button type="button" class="btn btn-primary btn-lg" style="width:100%" onclick="location.href=\'checkout.html\'">Tentar novamente</button>' +
      '<a class="btn btn-outline" style="width:100%;margin-top:10px" href="https://wa.me/' + esc(CONFIG.WHATSAPP || '') + '" target="_blank" rel="noopener">Falar no WhatsApp</a>';
  }

  function retomarPix() {
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem('pdv_pix') || 'null'); } catch (e) {}
    if (!saved || !saved.qr || !saved.pedido) return;
    chamar('acao=statuspedido&pedido=' + encodeURIComponent(saved.pedido), function (r) {
      if (r && r.status === 'approved') { limparPix(); mostrarAprovado(); }
      else mostrarPixMP(saved);
    });
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function init() {
    preCurso = getParam('curso') || '';
    dataTurma = getParam('data') || getParam('dataTurma') || '';
    // normaliza curso (acentos, case)
    (function () {
      var n = String(preCurso).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (n === 'pao') preCurso = 'Pão';
      else if (n === 'pizza') preCurso = 'Pizza';
      else if (preCurso) {
        // fallback capitaliza
        preCurso = preCurso.charAt(0).toUpperCase() + preCurso.slice(1).toLowerCase();
        if (preCurso === 'Pao') preCurso = 'Pão';
      }
    })();
    // fluxos pós-pagamento (aprovado/recusado/pendente e retomar Pix) passam na frente do gate
    var pag = getParam('pagamento');
    if (pag === 'aprovado') { mostrarAprovado(); return; }
    if (pag === 'recusado' || pag === 'pendenciante') { mostrarPagamentoNaoAprovado(pag); return; }
    if (!getParam('curso')) retomarPix();
    // gate: só abre o checkout de um curso à venda (uma oficina por vez)
    if (!preCurso) { bloquearCheckout(); return; }
    // header turma
    var elData = qs('#ckTurmaData');
    if (elData) elData.textContent = dataTurma || '—';
    var elCurso = qs('#ckTurmaCurso');
    if (elCurso) {
      if (preCurso) elCurso.textContent = preCurso + (CURSO_INFO[preCurso] ? ' · ' + CURSO_INFO[preCurso].hora : '');
      else elCurso.textContent = 'Pão e Pizza';
    }
    // qtd inicial
    setQtd(1);
    radioPagamentos();
    // aquece o servidor (Apps Script tem cold start de 9-15s) para o pagamento ser rápido
    chamar('acao=ping', function () {});
    // carrega ocupação das turmas (contador de vagas + bloqueio)
    carregarVagas();
    // beacon de funil (o backend registra em Logs)
    chamar('acao=log&tipo=checkout&detalhe=' + encodeURIComponent(preCurso || 'todos'), function () {});
    // código debounce
    var inpCod = qs('#ckCodigo');
    if (inpCod) {
      inpCod.addEventListener('input', function () {
        codigoOk = false;
        codigoTipo = '';
        codigoValor = 0;
        codigoReserva = null;
        var h = qs('#ckCodigoHint');
        if (h) { h.textContent = ''; h.className = 'ck-code-hint'; }
        atualizarResumo();
        clearTimeout(codigoTimer);
        codigoTimer = setTimeout(validarCodigoCliente, 600);
      });
    }
    // link de venda reservada: pré-preenche e valida o código da URL
    var codUrl = getParam('codigo');
    if (codUrl) {
      var codInp = qs('#ckCodigo');
      if (codInp) codInp.value = codUrl.trim();
      var codWrap = qs('#ckCodigoWrap');
      if (codWrap) codWrap.removeAttribute('hidden');
      var codBtn = qs('#ckCodigoToggle');
      if (codBtn) codBtn.textContent = 'Código de desconto';
      setTimeout(validarCodigoCliente, 120);
    }
  }

  // expõe
  window.Checkout = {
    setQtd: setQtd,
    goStep: goStep,
    enviar: enviar,
    toggleCodigo: toggleCodigo,
    verificarPix: function () {
      var st = qs('#ckPixStatus');
      if (st) st.textContent = 'Verificando…';
      checkPix();
    },
    _init: init
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
