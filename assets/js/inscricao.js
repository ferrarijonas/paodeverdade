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

    var btn = document.querySelector('#pdvModal .btn-submit');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Preparando pagamento…';
    }

    var params = [
      'acao=checkout',
      'nome=' + encodeURIComponent(nome),
      'whatsapp=' + encodeURIComponent(whats),
      'email=' + encodeURIComponent(email),
      'curso=' + encodeURIComponent(curso),
      'dataTurma=' + encodeURIComponent(dataTurma),
      'valor=' + encodeURIComponent(valor),
      'callback=pdvCheckout'
    ].join('&');

    var script = document.createElement('script');
    window.pdvCheckout = function (data) {
      delete window.pdvCheckout;
      script.remove();
      if (btn) { btn.disabled = false; btn.textContent = 'Ir para o pagamento'; }
      if (data && data.ok) {
        window.location.href = data.url;
      } else {
        mostrarErro((data && data.erro) || 'Não foi possível preparar o pagamento.');
      }
    };
    script.onerror = function () {
      delete window.pdvCheckout;
      script.remove();
      if (btn) { btn.disabled = false; btn.textContent = 'Ir para o pagamento'; }
      mostrarErro('Não foi possível preparar o pagamento. Tente novamente.');
    };
    script.src = url + '?' + params;
    document.body.appendChild(script);
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
      '      <p class="pdv-erro" id="pdvErro" style="display:none"></p>' +
      '      <p class="pdv-nota">Pagamento seguro via Mercado Pago · Pix ou cartão em até 12x.</p>' +
      '      <button type="submit" class="btn btn-primary btn-lg btn-submit" style="width:100%">Ir para o pagamento</button>' +
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
