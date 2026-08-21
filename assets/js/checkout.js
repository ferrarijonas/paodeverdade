/* checkout.js — Pão de Verdade — página dedicada */
(function () {
  var CONFIG = (typeof PDV_CONFIG !== 'undefined') ? PDV_CONFIG : {};
  var PRECO = 275;
  var CURSO_INFO = { 'Pão': { hora: '8h às 13h' }, 'Pizza': { hora: '17h às 22h' } };
  var codigoOk = false;
  var codigoTimer = null;
  var qtd = 1;
  var preCurso = '';
  var dataTurma = '';

  function qs(s, el) { return (el || document).querySelector(s); }
  function qsa(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }

  function getParam(n) {
    try { return new URLSearchParams(location.search).get(n) || ''; } catch (e) { return ''; }
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
    if (!v) { input.classList.remove('is-valid', 'is-invalid'); if (hint) hint.textContent = 'Obrigatório para certificado'; hint.className = 'ck-hint'; return false; }
    if (validarCPF(v)) { input.classList.remove('is-invalid'); input.classList.add('is-valid'); if (hint) { hint.textContent = '✓ CPF válido'; hint.className = 'ck-hint ok'; } return true; }
    if (normalizarCPF(v).length === 11) { input.classList.remove('is-valid'); input.classList.add('is-invalid'); if (hint) { hint.textContent = 'CPF inválido — confira os 11 dígitos'; hint.className = 'ck-hint err'; } return false; }
    input.classList.remove('is-valid', 'is-invalid'); if (hint) { hint.textContent = 'Digite os 11 dígitos'; hint.className = 'ck-hint'; } return false;
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

  function pessoaBlock(i, cursoPre) {
    var isPao = cursoPre === 'Pão';
    var isPizza = cursoPre === 'Pizza';
    return '' +
      '<div class="ck-pessoa" data-pessoa="' + i + '">' +
      '<div class="ck-pessoa-title">Pessoa ' + (i + 1) + '</div>' +
      '<div class="ck-grid2">' +
      '<div class="ck-field"><label for="ckNome' + i + '">Nome completo <span class="ck-req">*</span></label><input type="text" id="ckNome' + i + '" autocomplete="name" required placeholder="Ex.: Maria Silva"></div>' +
      '<div class="ck-field"><label for="ckCpf' + i + '">CPF <span class="ck-req">*</span></label><input type="text" id="ckCpf' + i + '" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00" maxlength="14" required><span class="ck-hint" id="hint-ckCpf' + i + '">Para certificado e recibo</span></div>' +
      '</div>' +
      '<div class="ck-grid2">' +
      '<div class="ck-field"><label for="ckWhats' + i + '">WhatsApp (com DDD) <span class="ck-req">*</span></label><input type="tel" id="ckWhats' + i + '" autocomplete="tel" placeholder="(34) 99999-9999" required></div>' +
      '<div class="ck-field"><label for="ckEmail' + i + '">E-mail <span class="ck-req">*</span></label><input type="email" id="ckEmail' + i + '" autocomplete="email" placeholder="maria@email.com" required></div>' +
      '</div>' +
      '<div class="ck-field"><span class="ck-label">Curso(s) <span class="ck-req">*</span></span>' +
      '<div class="ck-cursos">' +
      '<label class="ck-curso"><input type="checkbox" name="ckCurso' + i + '" value="Pão" data-pessoa="' + i + '"' + (isPao ? ' checked' : '') + '><span><b>Pão — 8h às 13h</b><small>R$ 275 · manhã</small></span></label>' +
      '<label class="ck-curso"><input type="checkbox" name="ckCurso' + i + '" value="Pizza" data-pessoa="' + i + '"' + (isPizza ? ' checked' : '') + '><span><b>Pizza — 17h às 22h</b><small>R$ 275 · noite</small></span></label>' +
      '</div></div>' +
      '</div>';
  }

  function lerPessoas() {
    var n = qtd;
    var out = [];
    for (var i = 0; i < n; i++) {
      var cursos = qsa('input[name="ckCurso' + i + '"]:checked').map(function (el) { return el.value; });
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
    if (codigoOk) desconto = Math.round(bruto * 0.15 * 100) / 100;
    else desconto = itens >= 2 ? Math.round(bruto * 0.15 * 100) / 100 : 0;
    var total = Math.round((bruto - desconto) * 100) / 100;
    return { itens: itens, bruto: bruto, desconto: desconto, total: total, pessoas: pessoas };
  }

  function atualizarResumo() {
    var t = totalPessoas();
    var el = qs('#ckResumo');
    if (!el) return;
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
      var descLabel = codigoOk ? 'Desconto (código)' : 'Desconto dupla/2 cursos (15%)';
      linhas += '<div class="ck-resumo-linha"><span>Subtotal (' + t.itens + ' itens)</span><span>R$ ' + t.bruto.toFixed(2) + '</span></div>';
      if (t.desconto > 0) linhas += '<div class="ck-resumo-linha ck-resumo-desc"><span>' + descLabel + '</span><span>− R$ ' + t.desconto.toFixed(2) + '</span></div>';
      linhas += '<div class="ck-resumo-total"><span>Total</span><span>R$ ' + t.total.toFixed(2) + '</span></div>';
      el.innerHTML = linhas;
    }
    var btn = qs('#ckBtnPagar');
    if (btn) btn.textContent = t.itens >= 1 ? 'Pagar R$ ' + t.total.toFixed(2) + ' →' : 'Pagar agora';
  }

  function setQtd(n) {
    qtd = n;
    qsa('.ck-qtd-btn').forEach(function (b) { b.classList.toggle('is-active', parseInt(b.getAttribute('data-qtd'), 10) === n); });
    // preserva valores
    var prev = lerPessoas();
    var box = qs('#ckPessoas');
    if (!box) return;
    var cursoForP2 = '';
    box.innerHTML = pessoaBlock(0, preCurso) + (n === 2 ? pessoaBlock(1, cursoForP2) : '');
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
  function limparErro() {
    var el = qs('#ckErro');
    if (el) { el.hidden = true; el.textContent = ''; }
  }

  function chamar(params, cb, errCb) {
    var base = (CONFIG.WEB_APP_URL || '').trim();
    if (!base || base.indexOf('COLE_AQUI') !== -1) {
      (errCb || cb)({ ok: false, erro: 'Inscrição online ainda não configurada.' });
      return;
    }
    var id = 'ckCb' + Date.now() + Math.floor(Math.random() * 1000);
    var done = false;
    window[id] = function (res) {
      if (done) return;
      done = true;
      try { delete window[id]; } catch (e) { window[id] = undefined; }
      var s = document.getElementById(id);
      if (s && s.parentNode) s.parentNode.removeChild(s);
      cb(res);
    };
    var s = document.createElement('script');
    s.id = id;
    s.onerror = function () {
      if (done) return;
      done = true;
      try { delete window[id]; } catch (e2) { window[id] = undefined; }
      if (s.parentNode) s.parentNode.removeChild(s);
      (errCb || cb)({ ok: false, erro: 'Falha de conexão. Tente novamente.' });
    };
    s.src = base + (base.indexOf('?') === -1 ? '?' : '&') + params + '&callback=' + id;
    document.body.appendChild(s);
    setTimeout(function () {
      if (done) return;
      done = true;
      try { delete window[id]; } catch (e3) { window[id] = undefined; }
      if (s.parentNode) s.parentNode.removeChild(s);
      (errCb || cb)({ ok: false, erro: 'Tempo esgotado. Tente novamente.' });
    }, 18000);
  }

  function validarCodigoCliente() {
    var input = qs('#ckCodigo');
    var hint = qs('#ckCodigoHint');
    if (!input || !hint) return;
    var v = input.value.trim().toUpperCase();
    if (!v) { codigoOk = false; hint.textContent = ''; hint.className = 'ck-code-hint'; atualizarResumo(); return; }
    hint.textContent = 'Validando…';
    hint.className = 'ck-code-hint';
    chamar('acao=validarcodigo&codigo=' + encodeURIComponent(v), function (res) {
      if (res && res.ok) {
        codigoOk = true;
        hint.textContent = res.msg || '✓ Código válido! Desconto aplicado.';
        hint.className = 'ck-code-hint ok';
      } else {
        codigoOk = false;
        hint.textContent = (res && res.erro) || 'Código inválido.';
        hint.className = 'ck-code-hint err';
      }
      atualizarResumo();
    }, function () {
      codigoOk = false;
      hint.textContent = 'Não foi possível validar agora.';
      hint.className = 'ck-code-hint err';
      atualizarResumo();
    });
  }

  function radioPagamentos() {
    var box = qs('#ckPagamentos');
    if (!box) return;
    var lista = CONFIG.PAGAMENTOS || ['pixmp', 'cartao'];
    var labels = { 'pixmp': 'Pix (Mercado Pago) — aprovação imediata', 'cartao': 'Cartão de crédito (Mercado Pago) — até 12x' };
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
    var params = 'acao=criarpedido' +
      '&pessoas=' + encodeURIComponent(JSON.stringify(pessoas)) +
      '&dataTurma=' + encodeURIComponent(dataTurma) +
      '&metodo=' + encodeURIComponent(metodo) +
      '&valor=' + encodeURIComponent(String(t.total));
    if (codigo) params += '&codigo=' + encodeURIComponent(codigo);
    chamar(params, function (res) {
      if (btn) { btn.disabled = false; atualizarResumo(); }
      if (!res || !res.ok) {
        mostrarErro((res && res.erro) || 'Não foi possível criar o pedido. Tente novamente.');
        return;
      }
      if (metodo === 'cartao' && res.url) { window.location.href = res.url; return; }
      if ((metodo === 'pixmp' || metodo === 'pix_mp') && res.qr) { mostrarPixMP(res); return; }
      mostrarPixManual(res);
    }, function (e) {
      if (btn) { btn.disabled = false; atualizarResumo(); }
      mostrarErro((e && e.erro) || 'Falha de conexão. Tente novamente.');
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

  function mostrarPixMP(res) {
    var main = qs('.checkout-main');
    var form = qs('#checkoutForm');
    var succ = qs('#ckSuccess');
    if (form) form.hidden = true;
    qsa('.ck-step').forEach(function (s) { s.classList.add('is-done'); });
    var total = (res && res.total != null) ? Number(res.total).toFixed(2) : totalPessoas().total.toFixed(2);
    succ.hidden = false;
    succ.innerHTML = '' +
      '<h2>Pague com Pix</h2>' +
      '<p class="ck-panel-sub">Escaneie o QR code ou use o copia e cola. Valor: <strong>R$ ' + total + '</strong></p>' +
      '<div style="text-align:center;margin:18px 0"><img src="data:image/png;base64,' + esc(res.qr || '') + '" alt="QR Code Pix" style="width:220px;height:220px;border-radius:12px;border:1px solid var(--line)"></div>' +
      '<div style="background:#fff;border:1.5px solid var(--line);border-radius:12px;padding:14px"><button type="button" class="btn btn-outline" style="width:100%" onclick="navigator.clipboard.writeText(' + JSON.stringify(res.copia || '') + ').then(function(){alert(\'Código Pix copiado!\')})">Copiar código Pix</button><p style="margin-top:10px;font-size:.78rem;color:var(--text-soft);word-break:break-all">' + esc(res.copia || '') + '</p></div>' +
      '<p class="ck-hint" id="ckPixStatus" style="text-align:center;margin-top:14px;font-weight:700">Aguardando pagamento…</p>';
    // polling
    var tentativas = 0;
    var maxTent = 40;
    var iv = setInterval(function () {
      tentativas++;
      if (tentativas > maxTent) { clearInterval(iv); var st = qs('#ckPixStatus'); if (st) st.textContent = 'Se o pagamento não aparecer, fale conosco no WhatsApp.'; return; }
      chamar('acao=statuspedido&pedido=' + encodeURIComponent(res.pedido), function (r) {
        if (r && r.status === 'approved') {
          clearInterval(iv);
          var st2 = qs('#ckPixStatus');
          if (st2) st2.textContent = '✓ Pagamento confirmado! Cada pessoa receberá o acesso por e-mail.';
          setTimeout(function () { window.location.href = 'aluno.html'; }, 1500);
        }
      });
    }, 4000);
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function init() {
    preCurso = getParam('curso') || '';
    dataTurma = getParam('data') || getParam('dataTurma') || '29/08/2026';
    // normaliza curso
    if (preCurso) preCurso = preCurso.charAt(0).toUpperCase() + preCurso.slice(1).toLowerCase();
    if (preCurso === 'Pao') preCurso = 'Pão';
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
    // código debounce
    var inpCod = qs('#ckCodigo');
    if (inpCod) {
      inpCod.addEventListener('input', function () {
        codigoOk = false;
        var h = qs('#ckCodigoHint');
        if (h) { h.textContent = ''; h.className = 'ck-code-hint'; }
        atualizarResumo();
        clearTimeout(codigoTimer);
        codigoTimer = setTimeout(validarCodigoCliente, 600);
      });
    }
  }

  // expõe
  window.Checkout = {
    setQtd: setQtd,
    goStep: goStep,
    enviar: enviar,
    _init: init
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
