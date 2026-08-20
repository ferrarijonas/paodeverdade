(function () {
  'use strict';

  var CONFIG = (typeof PDV_CONFIG !== 'undefined') ? PDV_CONFIG : {};
  var PRECO = 275;
  var CURSO_INFO = {
    'Pão': { hora: '8h às 13h', icon: '🍞' },
    'Pizza': { hora: '17h às 22h', icon: '🍕' }
  };

  function abrirModal(preCurso, dataTurma) {
    var overlay = document.getElementById('pdvModal');
    if (!overlay) return;
    document.getElementById('pdvDataTurma').value = dataTurma || '';
    document.getElementById('pdvDataLabel').textContent = dataTurma ? (' · ' + dataTurma) : '';
    setPessoas(1, preCurso);
    atualizarResumo();
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    var nome = document.getElementById('pdvNome0');
    if (nome) nome.focus();
  }

  function fecharModal() {
    var overlay = document.getElementById('pdvModal');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  function mostrarErro(msg) {
    var el = document.getElementById('pdvErro');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }

  function limparErro() {
    var el = document.getElementById('pdvErro');
    if (!el) return;
    el.style.display = 'none';
  }

  function setPessoas(n, preCurso) {
    document.getElementById('pdvQtd1').checked = (n === 1);
    document.getElementById('pdvQtd2').checked = (n === 2);
    var box = document.getElementById('pdvPessoas');
    box.innerHTML = pessoaBlock(0, preCurso || '') + (n === 2 ? pessoaBlock(1, '') : '');
  }

  function pessoaBlock(i, preCurso) {
    var checkedPao = preCurso === 'Pão' ? ' checked' : '';
    var checkedPizza = preCurso === 'Pizza' ? ' checked' : '';
    var label = i === 0 ? 'PESSOA 1' : 'PESSOA 2';
    return '<div class="pdv-pessoa">' +
      '<h4 class="pdv-pessoa-title">' + label + '</h4>' +
      '<label for="pdvNome' + i + '">Nome</label>' +
      '<input type="text" id="pdvNome' + i + '" autocomplete="name" required>' +
      '<label for="pdvWhats' + i + '">WhatsApp (com DDD)</label>' +
      '<input type="tel" id="pdvWhats' + i + '" autocomplete="tel" placeholder="(34) 99999-9999">' +
      '<label for="pdvEmail' + i + '">E-mail</label>' +
      '<input type="email" id="pdvEmail' + i + '" autocomplete="email" required>' +
      '<p class="pdv-pag-label">Curso(s)</p>' +
      '<label class="pdv-radio"><input type="checkbox" name="pdvCurso' + i + '" value="Pão" data-pessoa="' + i + '"' + checkedPao + '> Pão ' + CURSO_INFO['Pão'].hora + ' · R$ 275</label>' +
      '<label class="pdv-radio"><input type="checkbox" name="pdvCurso' + i + '" value="Pizza" data-pessoa="' + i + '"' + checkedPizza + '> Pizza ' + CURSO_INFO['Pizza'].hora + ' · R$ 275</label>' +
      '</div>';
  }

  function lerPessoas() {
    var qtd2 = document.getElementById('pdvQtd2').checked;
    var n = qtd2 ? 2 : 1;
    var pessoas = [];
    for (var i = 0; i < n; i++) {
      var cursos = [];
      document.querySelectorAll('input[name="pdvCurso' + i + '"]:checked').forEach(function (c) { cursos.push(c.value); });
      pessoas.push({
        nome: document.getElementById('pdvNome' + i).value.trim(),
        whatsapp: document.getElementById('pdvWhats' + i).value.trim(),
        email: document.getElementById('pdvEmail' + i).value.trim(),
        cursos: cursos
      });
    }
    return pessoas;
  }

  function totalPessoas() {
    var pessoas = lerPessoas();
    var itens = 0;
    pessoas.forEach(function (p) { itens += (p.cursos || []).length; });
    var bruto = itens * PRECO;
    var desconto = itens >= 2 ? Math.round(bruto * 0.15 * 100) / 100 : 0;
    return { itens: itens, bruto: bruto, desconto: desconto, total: Math.round((bruto - desconto) * 100) / 100 };
  }

  function atualizarResumo() {
    var t = totalPessoas();
    var el = document.getElementById('pdvResumo');
    if (!el) return;
    if (t.itens === 0) {
      el.innerHTML = '<p class="pdv-resumo-empty">Selecione pelo menos um curso.</p>';
      return;
    }
    var pessoas = lerPessoas();
    var html = '';
    pessoas.forEach(function (p, i) {
      (p.cursos || []).forEach(function (c) {
        html += '<div class="pdv-resumo-linha"><span>P' + (i + 1) + ' · ' + c + '</span><span>R$ ' + PRECO.toFixed(2) + '</span></div>';
      });
    });
    html += '<div class="pdv-resumo-linha"><span>Subtotal</span><span>R$ ' + t.bruto.toFixed(2) + '</span></div>';
    if (t.desconto > 0) {
      html += '<div class="pdv-resumo-linha pdv-resumo-desc"><span>Desconto dupla/2 cursos (15%)</span><span>− R$ ' + t.desconto.toFixed(2) + '</span></div>';
    }
    html += '<div class="pdv-resumo-total"><span>TOTAL</span><span>R$ ' + t.total.toFixed(2) + '</span></div>';
    el.innerHTML = html;
    var btn = document.querySelector('#pdvModal .btn-submit');
    if (btn) btn.textContent = t.itens >= 2 ? ('Pagar R$ ' + t.total.toFixed(2)) : ('Reservar · R$ ' + t.total.toFixed(2));
  }

  function chamar(params, cb, err) {
    var url = CONFIG.WEB_APP_URL || '';
    if (!url || url.indexOf('COLE_AQUI') !== -1) {
      err('Inscrição online ainda não configurada. Chama a gente no WhatsApp (34) 93618-6847!');
      return;
    }
    var id = 'pdvPedido' + Date.now();
    window[id] = function (data) { delete window[id]; script.remove(); cb(data); };
    var script = document.createElement('script');
    script.onerror = function () { delete window[id]; script.remove(); err('Não foi possível conectar. Verifique sua internet e tente novamente.'); };
    script.src = url + '?' + params + '&callback=' + id;
    document.body.appendChild(script);
  }

  function enviar(event) {
    event.preventDefault();
    limparErro();

    var pessoas = lerPessoas();
    var nome = pessoas[0] && pessoas[0].nome;
    var email = pessoas[0] && pessoas[0].email;
    if (!nome || !email) { mostrarErro('Preencha nome e e-mail de todas as pessoas.'); return; }
    var vazio = pessoas.some(function (p) { return !p.nome || !p.email || !(p.cursos && p.cursos.length); });
    if (vazio) { mostrarErro('Preencha os dados e selecione um curso para cada pessoa.'); return; }

    var metodoEl = document.querySelector('input[name="pdvPagamento"]:checked');
    var metodo = metodoEl ? metodoEl.value : 'pixmp';
    var dataTurma = document.getElementById('pdvDataTurma').value;
    var t = totalPessoas();

    var btn = document.querySelector('#pdvModal .btn-submit');
    if (btn) { btn.disabled = true; btn.textContent = 'Abrindo pagamento…'; }

    var params = 'acao=criarpedido&pessoas=' + encodeURIComponent(JSON.stringify(pessoas)) +
      '&dataTurma=' + encodeURIComponent(dataTurma) +
      '&metodo=' + encodeURIComponent(metodo) +
      '&valor=' + t.total;

    chamar(params, function (data) {
      if (btn) { btn.disabled = false; btn.textContent = 'Pagar'; }
      if (!data || !data.ok) { mostrarErro((data && data.erro) || 'Não foi possível reservar. Tente novamente.'); return; }
      if (metodo === 'cartao' && data.url) {
        window.location.href = data.url;
      } else if (metodo === 'pixmp' && data.qr) {
        mostrarPixMP(data);
      } else {
        mostrarPix(data);
      }
    }, function (msg) {
      if (btn) { btn.disabled = false; btn.textContent = 'Pagar'; }
      mostrarErro(msg);
    });
  }

  function mostrarPix(data) {
    var modal = document.querySelector('#pdvModal .pdv-modal');
    if (!modal) return;
    var whats = (CONFIG.WHATSAPP || '5534936186847');
    var msg = 'Oi! Acabei de reservar e vou enviar o comprovante do Pix de R$ ' + data.total + '.';
    var whatsLink = 'https://wa.me/' + whats + '?text=' + encodeURIComponent(msg);
    modal.innerHTML =
      '<button type="button" class="pdv-close" aria-label="Fechar">&times;</button>' +
      '<h3>Sua vaga está reservada!</h3>' +
      '<p class="pdv-sub">Para confirmar, faça um Pix de <strong>R$ ' + data.total + '</strong> para:</p>' +
      '<div class="pdv-pix">' +
      '  <p class="pdv-pix-key">' + (CONFIG.PIX_KEY || '') + '</p>' +
      '  <p class="pdv-pix-nome">' + (CONFIG.PIX_NOME || '') + '</p>' +
      '  <p class="pdv-pix-tipo">Chave Pix (CNPJ)</p>' +
      '</div>' +
      '<a class="btn btn-whatsapp btn-lg" style="width:100%" href="' + whatsLink + '" target="_blank" rel="noopener">Enviar comprovante no WhatsApp</a>' +
      '<p class="pdv-nota">Assim que a gente confirmar, cada pessoa recebe o acesso à Área do Estudante por e-mail.</p>';
    document.querySelector('#pdvModal .pdv-close').addEventListener('click', fecharModal);
  }

  function mostrarPixMP(data) {
    var modal = document.querySelector('#pdvModal .pdv-modal');
    if (!modal) return;
    var qr = data.qr || '';
    var copia = data.copia || '';
    var id = data.id || '';
    modal.innerHTML =
      '<button type="button" class="pdv-close" aria-label="Fechar">&times;</button>' +
      '<h3>Pague com Pix</h3>' +
      '<p class="pdv-sub">Escaneie o QR code ou use o copia e cola. Valor: <strong>R$ ' + data.total + '</strong></p>' +
      (qr ? '<div class="pdv-qr"><img src="data:image/png;base64,' + qr + '" alt="QR Code Pix"></div>' : '') +
      (copia ? '<div class="pdv-copia"><button type="button" class="btn btn-outline btn-lg" style="width:100%" onclick="navigator.clipboard && navigator.clipboard.writeText(\'' + copia.replace(/'/g, "\\'") + '\')">Copiar código Pix</button><p class="pdv-copia-text">' + copia + '</p></div>' : '') +
      '<p class="pdv-nota" id="pdvPixStatus">Aguardando pagamento…</p>';
    document.querySelector('#pdvModal .pdv-close').addEventListener('click', fecharModal);
    if (id) { pollPixMP(id); }
  }

  function pollPixMP(id) {
    var tentativas = 0;
    var timer = setInterval(function () {
      tentativas++;
      if (tentativas > 40) { clearInterval(timer); return; }
      chamar('acao=statuspix&id=' + encodeURIComponent(id), function (data) {
        var el = document.getElementById('pdvPixStatus');
        if (data && data.status === 'approved') {
          clearInterval(timer);
          if (el) el.innerHTML = 'Pagamento confirmado! Cada pessoa receberá o acesso por e-mail.';
        }
      }, function () {});
    }, 4000);
  }

  function radioPagamentos() {
    var lista = (CONFIG.PAGAMENTOS && CONFIG.PAGAMENTOS.length) ? CONFIG.PAGAMENTOS : ['pixmp', 'cartao'];
    var opcoes = {
      pixmp: 'Pix (Mercado Pago)',
      cartao: 'Cartão de crédito (Mercado Pago)'
    };
    var html = '';
    lista.forEach(function (metodo, idx) {
      if (!opcoes[metodo]) return;
      html += '<label class="pdv-radio"><input type="radio" name="pdvPagamento" value="' + metodo + '"' +
        (idx === 0 ? ' checked' : '') + '> ' + opcoes[metodo] + '</label>';
    });
    return html;
  }

  function montarModal() {
    var container = document.getElementById('pdvModalContainer');
    if (container) return;
    container = document.createElement('div');
    container.id = 'pdvModalContainer';
    container.innerHTML =
      '<div class="pdv-overlay" id="pdvModal">' +
      '  <div class="pdv-modal">' +
      '    <button type="button" class="pdv-close" aria-label="Fechar">&times;</button>' +
      '    <h3>Garantir minha vaga</h3>' +
      '    <p class="pdv-sub">Oficina<span id="pdvDataLabel"></span></p>' +
      '    <input type="hidden" id="pdvDataTurma">' +
      '    <p class="pdv-pag-label">Quantas pessoas?</p>' +
      '    <label class="pdv-radio"><input type="radio" name="pdvQtd" id="pdvQtd1" value="1" checked onchange="setPessoas(1)"> 1 pessoa</label>' +
      '    <label class="pdv-radio"><input type="radio" name="pdvQtd" id="pdvQtd2" value="2" onchange="setPessoas(2)"> 2 pessoas</label>' +
      '    <div id="pdvPessoas"></div>' +
      '    <div class="pdv-resumo" id="pdvResumo"></div>' +
      '    <p class="pdv-pag-label">Como quer pagar?</p>' +
      radioPagamentos() +
      '    <p class="pdv-erro" id="pdvErro" style="display:none"></p>' +
      '    <p class="pdv-nota">Desconto de 15% em pedidos com 2+ itens (dupla ou os dois cursos).</p>' +
      '    <button type="button" class="btn btn-primary btn-lg btn-submit" style="width:100%" onclick="enviarPedido()">Reservar</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(container);
    document.querySelector('#pdvModal .pdv-close').addEventListener('click', fecharModal);
    document.getElementById('pdvModal').addEventListener('click', function (e) {
      if (e.target === this) fecharModal();
    });
    document.addEventListener('change', function (e) {
      if (e.target && e.target.name && e.target.name.indexOf('pdvCurso') === 0) atualizarResumo();
    });
  }

  function vincularBotoes() {
    document.querySelectorAll('[data-pdv-open]').forEach(function (btn) {
      if (btn.dataset.pdvBound) return;
      btn.dataset.pdvBound = '1';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        abrirModal(btn.getAttribute('data-pdv-curso') || '', btn.getAttribute('data-pdv-data') || '');
      });
    });

    var configurado = CONFIG.WEB_APP_URL && CONFIG.WEB_APP_URL.indexOf('COLE_AQUI') === -1;
    document.querySelectorAll('.agenda-course').forEach(function (link) {
      if (link.dataset.pdvBound) return;
      link.dataset.pdvBound = '1';
      if (!configurado) return;
      link.addEventListener('click', function (e) {
        e.preventDefault();
        var curso = link.classList.contains('pao') ? 'Pão' : 'Pizza';
        abrirModal(curso, link.getAttribute('data-turma') || '');
      });
    });
  }

  window.setPessoas = setPessoas;
  window.enviarPedido = function () { enviar({ preventDefault: function () {} }); };

  function init() {
    montarModal();
    vincularBotoes();
    var mo = new MutationObserver(vincularBotoes);
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
