(function () {
  'use strict';

  var CONFIG = (typeof PDV_CONFIG !== 'undefined') ? PDV_CONFIG : {};

  function abrirModal(curso, dataTurma, valor) {
    var overlay = document.getElementById('pdvModal');
    if (!overlay) return;
    document.getElementById('pdvCurso').value = curso || '';
    document.getElementById('pdvDataTurma').value = dataTurma || '';
    document.getElementById('pdvValor').value = valor || '275';
    document.getElementById('pdvCursoLabel').textContent = curso || '';
    document.getElementById('pdvDataLabel').textContent = dataTurma ? (' · ' + dataTurma) : '';
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    document.getElementById('pdvNome').focus();
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

  function enviar(event) {
    event.preventDefault();
    limparErro();

    var nome = document.getElementById('pdvNome').value.trim();
    var whats = document.getElementById('pdvWhats').value.trim();
    var email = document.getElementById('pdvEmail').value.trim();
    var curso = document.getElementById('pdvCurso').value;
    var dataTurma = document.getElementById('pdvDataTurma').value;
    var valor = document.getElementById('pdvValor').value;

    if (!nome || !email) {
      mostrarErro('Preencha seu nome e seu e-mail.');
      return;
    }

    var url = CONFIG.WEB_APP_URL || '';
    if (!url || url.indexOf('COLE_AQUI') !== -1) {
      mostrarErro('Inscrição online ainda não configurada. Chama a gente no WhatsApp (34) 93618-6847!');
      return;
    }

    var metodoEl = document.querySelector('input[name="pdvPagamento"]:checked');
    var metodo = metodoEl ? metodoEl.value : 'pix';

    var btn = document.querySelector('#pdvModal .btn-submit');
    if (btn) {
      btn.disabled = true;
      btn.textContent = metodo === 'cartao' ? 'Abrindo pagamento…' : 'Reservando sua vaga…';
    }

    var base = [
      'nome=' + encodeURIComponent(nome),
      'whatsapp=' + encodeURIComponent(whats),
      'email=' + encodeURIComponent(email),
      'curso=' + encodeURIComponent(curso),
      'dataTurma=' + encodeURIComponent(dataTurma)
    ];

    if (metodo === 'cartao') {
      var params = ['acao=checkout'].concat(base, ['callback=pdvCheckout']).join('&');
      var script = document.createElement('script');
      window.pdvCheckout = function (data) {
        delete window.pdvCheckout;
        script.remove();
        if (btn) { btn.disabled = false; btn.textContent = 'Reservar minha vaga'; }
        if (data && data.ok && data.url) {
          window.location.href = data.url;
        } else {
          mostrarErro((data && data.erro) || 'Não foi possível abrir o pagamento.');
        }
      };
      script.onerror = function () {
        delete window.pdvCheckout;
        script.remove();
        if (btn) { btn.disabled = false; btn.textContent = 'Reservar minha vaga'; }
        mostrarErro('Não foi possível abrir o pagamento. Tente novamente.');
      };
      script.src = url + '?' + params;
      document.body.appendChild(script);
      return;
    }

    var params = ['acao=inscrever'].concat(base, ['callback=pdvInscricao']).join('&');

    var script = document.createElement('script');
    window.pdvInscricao = function (data) {
      delete window.pdvInscricao;
      script.remove();
      if (btn) { btn.disabled = false; btn.textContent = 'Reservar minha vaga'; }
      if (data && data.ok) {
        mostrarPix(curso, dataTurma, data.valor);
      } else {
        mostrarErro((data && data.erro) || 'Não foi possível reservar. Tente novamente.');
      }
    };
    script.onerror = function () {
      delete window.pdvInscricao;
      script.remove();
      if (btn) { btn.disabled = false; btn.textContent = 'Reservar minha vaga'; }
      mostrarErro('Não foi possível reservar. Verifique sua conexão e tente novamente.');
    };
    script.src = url + '?' + params;
    document.body.appendChild(script);
  }

  function mostrarPix(curso, dataTurma, valor) {
    var modal = document.querySelector('#pdvModal .pdv-modal');
    if (!modal) return;
    var whats = (CONFIG.WHATSAPP || '5534936186847');
    var msg = 'Oi! Acabei de reservar minha vaga na oficina de ' + curso +
      (dataTurma ? ' (' + dataTurma + ')' : '') +
      ' e estou enviando o comprovante do Pix.';
    var whatsLink = 'https://wa.me/' + whats + '?text=' + encodeURIComponent(msg);
    modal.innerHTML =
      '<button type="button" class="pdv-close" aria-label="Fechar">&times;</button>' +
      '<h3>Sua vaga está reservada!</h3>' +
      '<p class="pdv-sub">Para confirmar, faça um Pix de <strong>R$ ' + (valor || 275) + '</strong> para:</p>' +
      '<div class="pdv-pix">' +
      '  <p class="pdv-pix-key">' + (CONFIG.PIX_KEY || '') + '</p>' +
      '  <p class="pdv-pix-nome">' + (CONFIG.PIX_NOME || '') + '</p>' +
      '  <p class="pdv-pix-tipo">Chave Pix (CNPJ)</p>' +
      '</div>' +
      '<a class="btn btn-whatsapp btn-lg" style="width:100%" href="' + whatsLink + '" target="_blank" rel="noopener">Enviar comprovante no WhatsApp</a>' +
      '<p class="pdv-nota">Assim que a gente confirmar o pagamento, você recebe o acesso à Área do Estudante por e-mail.</p>';
    document.querySelector('#pdvModal .pdv-close').addEventListener('click', fecharModal);
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
      '    <p class="pdv-sub"><strong id="pdvCursoLabel">Curso</strong><span id="pdvDataLabel"></span></p>' +
      '    <form id="pdvForm" method="post" action="" enctype="application/x-www-form-urlencoded">' +
      '      <input type="hidden" name="curso" id="pdvCurso">' +
      '      <input type="hidden" name="dataTurma" id="pdvDataTurma">' +
      '      <input type="hidden" name="valor" id="pdvValor">' +
      '      <label for="pdvNome">Seu nome</label>' +
      '      <input type="text" id="pdvNome" name="nome" autocomplete="name" required>' +
      '      <label for="pdvWhats">WhatsApp (com DDD)</label>' +
      '      <input type="tel" id="pdvWhats" name="whatsapp" autocomplete="tel" placeholder="(34) 99999-9999">' +
      '      <label for="pdvEmail">E-mail</label>' +
      '      <input type="email" id="pdvEmail" name="email" autocomplete="email" required>' +
      '      <p class="pdv-pag-label">Como você quer pagar?</p>' +
      '      <label class="pdv-radio"><input type="radio" name="pdvPagamento" value="pix" checked> Pix (enviar comprovante)</label>' +
      '      <label class="pdv-radio"><input type="radio" name="pdvPagamento" value="cartao"> Cartão de crédito (Mercado Pago)</label>' +
      '      <p class="pdv-erro" id="pdvErro" style="display:none"></p>' +
      '      <p class="pdv-nota">Pagamento seguro. A confirmação chega no seu e-mail.</p>' +
      '      <button type="submit" class="btn btn-primary btn-lg btn-submit" style="width:100%">Reservar minha vaga</button>' +
      '    </form>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(container);

    document.querySelector('#pdvModal .pdv-close').addEventListener('click', fecharModal);
    document.getElementById('pdvModal').addEventListener('click', function (e) {
      if (e.target === this) fecharModal();
    });
    document.getElementById('pdvForm').addEventListener('submit', enviar);
  }

  function vincularBotoes() {
    document.querySelectorAll('[data-pdv-open]').forEach(function (btn) {
      if (btn.dataset.pdvBound) return;
      btn.dataset.pdvBound = '1';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        abrirModal(
          btn.getAttribute('data-pdv-curso') || '',
          btn.getAttribute('data-pdv-data') || '',
          btn.getAttribute('data-pdv-valor') || '275'
        );
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
        var turma = link.getAttribute('data-turma') || '';
        abrirModal(curso, turma, '275');
      });
    });
  }

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
