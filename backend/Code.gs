/* =========================================================
   PÃO DE VERDADE — Backend de inscrições (Google Apps Script)
   ---------------------------------------------------------
   O que faz:
   1. Recebe inscrição do site (formulário POST) e cria uma
      preferência de pagamento personalizada no Mercado Pago.
   2. Retorna uma página que redireciona o aluno pro checkout.
   3. Recebe o webhook do Mercado Pago e marca o aluno como
      "pago" na planilha.
   4. Envia automaticamente (por e-mail) o link do grupo da
      turma para os alunos confirmados.
   5. Serve o painel visual (backend/painel.html) com senha.

   Configuração (Script Properties):
   - MP_ACCESS_TOKEN  : seu access token de produção (APP_USR-...)
   - SHEET_ID         : id da planilha de inscrições
   - PAINEL_SENHA     : senha do painel
   ========================================================= */

var PROPS = PropertiesService.getScriptProperties();
var MP_API = 'https://api.mercadopago.com';
var PRECO_OFICINA = 275;

/* Configuração com fallback embutido (não precisa de Script Properties) */
function getMPToken() {
  var ambiente = PROPS.getProperty('MP_ENVIRONMENT') || 'production';
  var chave = ambiente === 'sandbox' ? 'MP_TEST_ACCESS_TOKEN' : 'MP_ACCESS_TOKEN';
  return PROPS.getProperty(chave) || '';
}
function getSheetId() {
  return PROPS.getProperty('SHEET_ID') ||
    '14_gGuMVl3oOp68y0Q1lpkde6I4uESlLJYwazICqnMMk';
}
function getPainelSenha() {
  return PROPS.getProperty('PAINEL_SENHA') || '';
}
function getWebAppUrl() {
  return PROPS.getProperty('WEB_APP_URL') || ScriptApp.getService().getUrl();
}
function getNotificarEmail() {
  return PROPS.getProperty('NOTIFICAR_EMAIL') || 'contato@jonasferrari.com.br';
}
function getTelegramBotToken() {
  return PROPS.getProperty('TELEGRAM_BOT_TOKEN') || '';
}
function getTelegramChatId() {
  return PROPS.getProperty('TELEGRAM_CHAT_ID') || '';
}

/* Função de configuração inicial — roda manualmente 1x (menu ou run) */
function configurarInicial() {
  PROPS.setProperty('MP_ACCESS_TOKEN', getMPToken());
  PROPS.setProperty('SHEET_ID', getSheetId());
  PROPS.setProperty('PAINEL_SENHA', getPainelSenha());
  PROPS.setProperty('WEB_APP_URL', getWebAppUrl());
  criarAbas();
  return 'configurado';
}

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Pão de Verdade')
    .addItem('Enviar convites de grupos (pagos)', 'enviarConvites')
    .addItem('Regenerar acesso da Área do Aluno', 'regenerarAcessoPorEmail')
    .addItem('Criar abas da planilha', 'criarAbas')
    .addToUi();
}

/* ---------------------------------------------------------
   doGet — serve o painel (com senha)
   URL:  {web_app_url}/exec?senha=SUA_SENHA
   --------------------------------------------------------- */
function doGet(e) {
  if (e && e.parameter && e.parameter.acao === 'ping') {
    try {
      var shPing = getSheet('Turmas');
      shPing.getRange(1, 1).getValue();
    } catch (errPing) {}
    return responder({ ok: true, ts: new Date().getTime() }, e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'aluno') {
    if (e.parameter.callback) {
      var callback = String(e.parameter.callback).replace(/[^a-zA-Z0-9_$.]/g, '');
      return ContentService.createTextOutput(callback + '(' + JSON.stringify(buscarAlunoComErro(e.parameter.token || '')) + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonOut(buscarAlunoComErro(e.parameter.token || ''));
  }

  if (e && e.parameter && e.parameter.acao === 'gerarcertificado') {
    return responder(gerarCertificado(e.parameter.token || '', e.parameter.curso || '', e.parameter.dataTurma || ''), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'adminarea') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder({
      ok: true,
      url: 'https://ferrarijonas.github.io/paodeverdade/aluno.html?token=' + encodeURIComponent(adminToken(e.parameter.curso))
    }, e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'reenviar') {
    var resR = reenviarAcessoPorContato(e.parameter.contato || '');
    if (e.parameter.callback) {
      var cbR = String(e.parameter.callback).replace(/[^a-zA-Z0-9_$.]/g, '');
      return ContentService.createTextOutput(cbR + '(' + JSON.stringify(resR) + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonOut(resR);
  }

  if (e && e.parameter && e.parameter.acao === 'checkout') {
    var res = criarCheckout(e.parameter);
    if (e.parameter.callback) {
      var cb = String(e.parameter.callback).replace(/[^a-zA-Z0-9_$.]/g, '');
      return ContentService.createTextOutput(cb + '(' + JSON.stringify(res) + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonOut(res);
  }

  if (e && e.parameter && e.parameter.acao === 'inscrever') {
    return responder(inscreverManual(e.parameter), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'pixmp') {
    return responder(criarPixMP(e.parameter), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'statuspix') {
    return responder(statusPixMP(e.parameter.id), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'confirmar') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(confirmarPagamento(e.parameter.id), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'manutencao' && e.parameter.senha === getPainelSenha()) {
    return jsonOut(manutencao());
  }

  if (e && e.parameter && e.parameter.acao === 'criarabas' && e.parameter.senha === getPainelSenha()) {
    criarAbas();
    return jsonOut({ ok: true });
  }

  if (e && e.parameter && e.parameter.acao === 'registrarcertificados' && e.parameter.senha === getPainelSenha()) {
    return jsonOut(registrarCertificados());
  }

  if (e && e.parameter && e.parameter.acao === 'autoconcluir' && e.parameter.senha === getPainelSenha()) {
    return jsonOut(autoConcluirTurmasPassadas());
  }

  if (e && e.parameter && e.parameter.acao === 'removertriggerautoconcluir' && e.parameter.senha === getPainelSenha()) {
    return jsonOut(removerTriggerAutoConcluir());
  }

  if (e && e.parameter && e.parameter.acao === 'emailcertificado' && e.parameter.senha === getPainelSenha()) {
    return jsonOut(emailCertificadoPorId(e.parameter.id || ''));
  }

  if (e && e.parameter && e.parameter.acao === 'emailcertificados' && e.parameter.senha === getPainelSenha()) {
    return jsonOut(enviarEmailsCertificados());
  }

  if (e && e.parameter && e.parameter.acao === 'criartriggeremailcert' && e.parameter.senha === getPainelSenha()) {
    return jsonOut(criarTriggerEmailCertificados());
  }

  if (e && e.parameter && e.parameter.acao === 'dados') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(listarPainelDados(), e.parameter.callback);
  }
  if (e && e.parameter && e.parameter.acao === 'regenerar') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(regenerarAcessoPorId(e.parameter.id), e.parameter.callback);
  }
  if (e && e.parameter && e.parameter.acao === 'excluir') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(excluirInscrito(e.parameter.id), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'criarpedido') {
    return responder(criarPedido(e.parameter), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'statuspedido') {
    return responder(statusPedido(e.parameter.pedido), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'confirmarpedido') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(confirmarPedido(e.parameter.pedido), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'excluirpedido') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(excluirPedido(e.parameter.pedido), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'cancelarpedido') {
    return responder(cancelarPedidoComCredito(e.parameter), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'validarcodigo') {
    return responder(validarCodigo(e.parameter.codigo), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'turmas') {
    return responder(filtrarTurmasAtivas(listarTurmasComVagas(true)), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'proximas') {
    return responder(proximasTurmas(), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'flags') {
    return responder(flagsPublicas(), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'metodo') {
    return responder(lerMetodoPublico(), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'tts') {
    return responder(ttsSintetizar(e.parameter), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'salvarmetodo') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(salvarMetodo(e.parameter), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'salvarreceita') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(salvarReceita(e.parameter), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'listaespera') {
    return responder(entrarNaLista(e.parameter), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'listaesperas') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(listarListaEspera(), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'excluirespera') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(excluirEspera(e.parameter.id), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'setarvagas') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(setarVagas(e.parameter), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'log') {
    registrarLog(e.parameter.tipo || 'front', '', e.parameter.detalhe || '', { origem: 'front' });
    return responder({ ok: true }, e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'logs') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(listarLogs(e.parameter.n), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'diagnostico') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(diagnosticar(), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'insights') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(insights(), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'backup') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(fazerBackup(), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'criartriggerbackup') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(criarTriggerBackup(), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'telegramtest') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(telegramTeste(), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'analitica') {
    registrarAnalitica(e.parameter);
    return responder({ ok: true }, e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'analiticas') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(analiticas(), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'config') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(configurarProp(e.parameter), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'atualizar') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(atualizarInscricao(e.parameter), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'concluido') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(marcarConcluido(e.parameter.id), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'reenviarconvite') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(reenviarConviteGrupo(e.parameter.id), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'gerarcupom') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(gerarCupom(e.parameter), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'reativarcupom') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(reativarCupom(e.parameter.codigo), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'excluircupom') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(excluirCupom(e.parameter.codigo), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'reservarvaga') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(reservarVaga(e.parameter), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'lembrarcreditos') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(executarLembretes(), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'executarlembretes') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(executarLembretes(), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'criarlembrete') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(criarLembrete(e.parameter), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'listarlembretes') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(listarLembretes(), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'excluirlembrete') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(excluirLembrete(e.parameter.id), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'alternarlembrete') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(alternarLembrete(e.parameter.id, e.parameter.ativo === '1'), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'criartriggerlembrete') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(criarTriggerLembrete(), e.parameter.callback);
  }

  var senha = (e && e.parameter && e.parameter.senha) ? e.parameter.senha : '';
  var esperada = getPainelSenha();
  if (senha && senha === esperada) {
    if (e.parameter.setup === '1') {
      var base = ScriptApp.getService().getUrl();
      PROPS.setProperty('WEB_APP_URL', base);
      try { criarAbas(); } catch (x) {}
      return HtmlService.createHtmlOutput(
        '<html><body style="font-family:Segoe UI,Arial,sans-serif;text-align:center;padding:60px">' +
        '<h1>Configurado!</h1><p>WEB_APP_URL salvo como: <b>' + base + '</b></p>' +
        '<p><a href="' + base + '?senha=' + encodeURIComponent(senha) + '">Ir para o painel →</a></p>' +
        '</body></html>'
      );
    }
    return ContentService.createTextOutput(
      '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">' +
      '<meta http-equiv="refresh" content="3;url=https://ferrarijonas.github.io/paodeverdade/admin.html">' +
      '<title>Painel atualizado</title></head>' +
      '<body style="font-family:Segoe UI,Arial,sans-serif;text-align:center;padding:60px;background:#F2F0EC;color:#212121">' +
      '<h1 style="color:#4A2E1B">Este painel antigo foi desativado.</h1>' +
      '<p style="color:#6E6A64">Use o novo painel de gestão. Redirecionando…</p>' +
      '<p><a href="https://ferrarijonas.github.io/paodeverdade/admin.html" ' +
      'style="display:inline-block;background:#212121;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700">' +
      'Abrir o novo painel agora</a></p></body></html>'
    ).setMimeType(ContentService.MimeType.HTML);
  }
  return ContentService.createTextOutput(
    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Pão de Verdade — Painel</title>' +
    '<style>body{font-family:Segoe UI,Arial,sans-serif;background:#F2F0EC;display:flex;' +
    'align-items:center;justify-content:center;min-height:100vh;margin:0;color:#212121}' +
    '.box{background:#fff;padding:40px;border-radius:12px;box-shadow:0 12px 34px rgba(33,33,33,.12);' +
    'width:320px;text-align:center}h1{font-size:1.4rem;margin-bottom:8px;color:#4A2E1B}' +
    'p{font-size:.9rem;color:#6E6A64;margin-bottom:20px}input{width:100%;padding:12px;' +
    'border:1px solid #E2DED7;border-radius:8px;margin-bottom:14px;box-sizing:border-box}' +
    'button{width:100%;padding:13px;background:#212121;color:#fff;border:none;border-radius:999px;' +
    'font-weight:700;cursor:pointer}</style></head><body>' +
    '<form class="box" method="get"><h1>Painel de Inscrições</h1>' +
    (senha ? '<p style="color:#C62828">Senha incorreta. Tente novamente.</p>' : '<p>Digite a senha para acessar.</p>') +
    '<input type="password" name="senha" placeholder="Senha" required>' +
    '<button type="submit">Entrar</button></form></body></html>'
  ).setMimeType(ContentService.MimeType.HTML);
}

/* ---------------------------------------------------------
   doPost — recebe inscrições do site e webhooks do Mercado Pago
   --------------------------------------------------------- */
function doPost(e) {
  try {
    var body = parseBody(e);

    /* Setup: configura WEB_APP_URL e cria abas (protegido por senha) */
    var senha = (e && e.parameter && e.parameter.senha) || (body && body.senha) || '';
    var tipo = (e && e.parameter && e.parameter.tipo) || (body && body.tipo) || '';
    if (tipo === 'setup') {
      if (senha !== getPainelSenha()) return jsonOut({ ok: false, erro: 'senha incorreta' });
      var base = ScriptApp.getService().getUrl();
      PROPS.setProperty('WEB_APP_URL', base);
      try { criarAbas(); } catch (x) {}
      return jsonOut({ ok: true, web_app_url: base });
    }

    /* Caso 1: webhook do Mercado Pago */
    if (body && body.type === 'payment') {
      return handleWebhook(body);
    }
    if (e && e.parameter && (e.parameter.tipo === 'webhook')) {
      return handleWebhook(e.parameter);
    }

    /* Caso 2: inscrição do site */
    return handleInscricao(body || e.parameter);
  } catch (err) {
    return jsonOut({ ok: false, erro: String(err) });
  }
}

function parseBody(e) {
  if (e && e.postData && e.postData.contents) {
    var c = e.postData.contents;
    try { return JSON.parse(c); } catch (x) { /* fallback */ }
    var params = {};
    c.split('&').forEach(function (kv) {
      var p = kv.split('=');
      params[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' '));
    });
    return params;
  }
  return e && e.parameter ? e.parameter : {};
}

/* ---------------------------------------------------------
   INSCRIÇÃO — cria preferência no MP e redireciona pro checkout
   Campos esperados: nome, whatsapp, email, curso, dataTurma, valor
   --------------------------------------------------------- */
function handleInscricao(d) {
  var res = criarCheckout(d);
  if (!res.ok) {
    return jsonOut({ ok: false, erro: res.erro });
  }
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">' +
    '<title>Redirecionando…</title></head><body>' +
    '<p>Preparando seu pagamento seguro…</p>' +
    '<script>window.location.replace(' + JSON.stringify(res.url) + ');</script>' +
    '</body></html>'
  ).setTitle('Redirecionando para o pagamento');
}

function criarCheckout(d) {
  var nome = (d.nome || '').trim();
  var whats = (d.whatsapp || '').trim();
  var email = (d.email || '').trim();
  var curso = (d.curso || '').trim();
  var dataTurma = (d.dataTurma || '').trim();
  var valor = PRECO_OFICINA;

  if (!nome || !email) {
    return { ok: false, erro: 'Preencha nome e e-mail.' };
  }

  var sheet = getSheet('Inscritos');
  var rowId = generateId(sheet);
  var areaToken = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');

  var pref = criarPreferenciaMP({
    id: rowId,
    nome: nome,
    email: email,
    curso: curso,
    dataTurma: dataTurma,
    valor: valor,
    token: areaToken
  });

  if (!pref || !pref.init_point) {
    return { ok: false, erro: 'Não foi possível criar o pagamento. Tente novamente.' };
  }

  var now = new Date();
  sheet.appendRow([
    rowId, nome, whats, email, curso, dataTurma, valor,
    pref.id, '', 'aguardando', 'não', formatDate(now),
    hashToken(areaToken), '', '', '', 'não', areaToken, '', '', gerarCodigoConvite(), 0, '', ''
  ]);

  return { ok: true, url: pref.init_point };
}

/* ---------------------------------------------------------
    INSCRIÇÃO MANUAL (Pix com comprovante)
   Grava como "aguardando"; o aluno recebe a chave Pix e
   envia o comprovante. O painel confirma e envia os acessos.
   --------------------------------------------------------- */
function inscreverManual(d) {
  var nome = (d.nome || '').trim();
  var whats = (d.whatsapp || '').trim();
  var email = (d.email || '').trim();
  var curso = (d.curso || '').trim();
  var dataTurma = (d.dataTurma || '').trim();
  var valor = PRECO_OFICINA;

  if (!nome || !email) {
    return { ok: false, erro: 'Preencha nome e e-mail.' };
  }

  var sheet = getSheet('Inscritos');
  var rowId = generateId(sheet);
  var areaToken = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');

  var now = new Date();
  sheet.appendRow([
    rowId, nome, whats, email, curso, dataTurma, valor,
    '', '', 'aguardando', 'não', formatDate(now),
    hashToken(areaToken), '', '', '', 'não', areaToken, '', '', gerarCodigoConvite(), 0, '', ''
  ]);

  return { ok: true, valor: valor };
}

function confirmarPagamento(id) {
  var sheet = getSheet('Inscritos');
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(id)) continue;
    sheet.getRange(i + 1, 10).setValue('pago');
    enviarAcessoAluno(i + 1);
    enviaConviteSePossivel(i + 1);
    return { ok: true };
  }
  return { ok: false, erro: 'Inscrição não encontrada.' };
}

/* Pix via Mercado Pago (Checkout Transparente) — devolve QR + copia-e-cola */
function criarPixMP(d) {
  var nome = (d.nome || '').trim();
  var whats = (d.whatsapp || '').trim();
  var email = (d.email || '').trim();
  var curso = (d.curso || '').trim();
  var dataTurma = (d.dataTurma || '').trim();
  var valor = PRECO_OFICINA;

  if (!nome || !email) {
    return { ok: false, erro: 'Preencha nome e e-mail.' };
  }

  var token = getMPToken();
  if (!token) return { ok: false, erro: 'Pagamento via Mercado Pago não configurado.' };

  var sheet = getSheet('Inscritos');
  var rowId = generateId(sheet);
  var areaToken = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');

  var payload = {
    transaction_amount: valor,
    description: 'Oficina de ' + curso + (dataTurma ? ' · ' + dataTurma : ''),
    payment_method_id: 'pix',
    external_reference: rowId,
    notification_url: getWebAppUrl(),
    payer: {
      email: email,
      first_name: nome
    }
  };

  var res = UrlFetchApp.fetch(MP_API + '/v1/payments', {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var data = JSON.parse(res.getContentText());
  if (code >= 400 || !data || !data.id) {
    Logger.log('MP erro Pix: ' + code + ' ' + res.getContentText());
    return { ok: false, erro: 'Não foi possível gerar o Pix.' };
  }

  var td = data.point_of_interaction && data.point_of_interaction.transaction_data ? data.point_of_interaction.transaction_data : {};
  var qr = td.qr_code_base64 || '';
  var copia = td.qr_code || '';

  var now = new Date();
  sheet.appendRow([
    rowId, nome, whats, email, curso, dataTurma, valor,
    '', data.id, 'aguardando', 'não', formatDate(now),
    hashToken(areaToken), '', '', '', 'não', areaToken, '', '', gerarCodigoConvite(), 0, '', ''
  ]);

  return { ok: true, valor: valor, id: data.id, qr: qr, copia: copia };
}

function statusPixMP(id) {
  if (!id) return { status: 'pending' };
  var pagamento = consultarPagamento(id);
  if (!pagamento) return { status: 'pending' };
  if (pagamento.status === 'approved') {
    var ref = pagamento.external_reference || '';
    var sheet = getSheet('Inscritos');
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) !== String(ref)) continue;
      if (String(rows[i][9] || '').trim() !== 'pago') {
        sheet.getRange(i + 1, 10).setValue('pago');
        enviarAcessoAluno(i + 1);
        enviaConviteSePossivel(i + 1);
      }
      break;
    }
    return { status: 'approved' };
  }
  return { status: pagamento.status || 'pending' };
}

/* =========================================================
   MODELO DE PEDIDO — dupla e/ou dois cursos, desconto 15%
   ========================================================= */
function normalizarCPF(v) {
  return String(v || '').replace(/\D/g, '').slice(0, 11);
}
function formatarCPF(v) {
  var d = normalizarCPF(v);
  if (d.length !== 11) return d;
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

function parsePessoas(d) {
  var raw = d.pessoas || '[]';
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch (e) { return []; }
  }
  return Array.isArray(raw) ? raw : [];
}

function criarPedido(d) {
  var pessoas = parsePessoas(d);
  var dataTurma = (d.dataTurma || '').trim();
  var metodo = (d.metodo || 'cartao').trim();
  if (!pessoas.length) return { ok: false, erro: 'Informe ao menos uma pessoa.' };

  var itens = [];
  for (var p = 0; p < pessoas.length; p++) {
    var pes = pessoas[p];
    var nome = String(pes.nome || '').trim();
    var email = String(pes.email || '').trim();
    var cpfRaw = String(pes.cpf || '').trim();
    var cpf = normalizarCPF(cpfRaw);
    if (!nome || !email) return { ok: false, erro: 'Preencha nome e e-mail de todas as pessoas.' };
    if (!cpf || !validarCPF(cpf)) return { ok: false, erro: 'CPF inválido para ' + (nome || ('pessoa ' + (p + 1))) + '. Confira os 11 dígitos.' };
    var cursos = Array.isArray(pes.cursos) ? pes.cursos : [];
    var sel = [];
    cursos.forEach(function (c) {
      var n = normalizarCurso(c);
      if (n === 'Pão' || n === 'Pizza') sel.push(n);
    });
    if (!sel.length) return { ok: false, erro: 'Selecione ao menos um curso para cada pessoa.' };
    sel.forEach(function (c) {
      itens.push({ pessoa: p, nome: nome, whats: String(pes.whatsapp || '').trim(), email: email, cpf: cpf, curso: c });
    });
  }

  /* ---- GATE: uma oficina por vez (TURMA_ATIVA) ----
     Recusa qualquer item de turma que não esteja à venda, antes do claim
     (não segura reserva nem cobra). Vazia = nada à venda. */
  if (!turmasAtivas().length) return { ok: false, erro: 'Inscrições encerradas — a próxima oficina abre em breve. Entre na lista de espera.', turma_nao_aberta: true };
  for (var gi = 0; gi < itens.length; gi++) {
    if (!turmaAtiva(itens[gi].curso, dataTurma)) {
      return { ok: false, erro: 'Esta turma de ' + itens[gi].curso + ' está encerrada. Veja as próximas datas em agenda.html.', turma_nao_aberta: true };
    }
  }

  var bruto = itens.length * PRECO_OFICINA;
  var codigo = String(d.codigo || '').trim().toUpperCase();
  var desconto = 0;
  var total = bruto;
  var pedidoId = '';
  var pessoasCriadas = [];
  var pagInfo = null;

  /* ---- IDEMPOTÊNCIA (poka-yoke anti cobrança dupla) ----
     O frontend envia um client_order_id único por tentativa e o reutiliza
     em retries. O mesmo id retorna o MESMO pedido (replay), nunca cria 2x.
     Validação (pessoas/cursos/cupom) roda ANTES do claim para não segurar
     reserva em pedidos inválidos. */
  var cid = String(d.client_order_id || d.coid || '').trim();
  if (cid) {
    var cachePed = CacheService.getScriptCache();
    var lock = LockService.getScriptLock();
    var lockOk = false;
    try { lockOk = lock.tryLock(25000); } catch (eL) {}
    if (!lockOk) return { ok: false, erro: 'Servidor ocupado. Tente novamente em instantes.' };
    try {
      var cachedResp = cachePed.get('resp:' + cid);
      if (cachedResp) { try { return JSON.parse(cachedResp); } catch (eC) {} }
      var dupe = buscarPedidoPorCid(cid);
      if (dupe) return dupe;
      if (cachePed.get('claim:' + cid)) return { ok: false, erro: 'Pedido em processamento. Tente novamente em instantes.' };
      cachePed.put('claim:' + cid, '1', 7200);
    } finally { try { lock.releaseLock(); } catch (eR) {} }
  }

  /* ---- VAGAS + CUPOM + PAGAMENTO — tudo sob a MESMA lock ----
     Desconto (cupom single-use), checagem de vagas e gravação atômicos:
     dois pedidos em paralelo não aplicam o mesmo cupom nem estouram a
     última vaga. O id do pagamento entra NA linha do pedido — se o MP
     não devolveu id, o pedido falha sem gravar nada (vaga não fica presa). */
  var vlock = LockService.getScriptLock();
  var vlockOk = false;
  try { vlockOk = vlock.tryLock(20000); } catch (eL2) {}
  if (!vlockOk) { if (cid) soltarClaim(cid); return { ok: false, erro: 'Servidor ocupado. Tente novamente em instantes.' }; }
  try {
    var descCalc = calcularDescontoPedido(itens.length, pessoas, codigo);
    if (descCalc.erro) { if (cid) soltarClaim(cid); return { ok: false, erro: descCalc.erro }; }
    desconto = descCalc.desconto || 0;
    total = Math.round((bruto - desconto) * 100) / 100;

    var vagasRes = checarVagas(itens, dataTurma, codigo);
    if (vagasRes.erro) {
      if (cid) soltarClaim(cid);
      registrarLog('erro', '', 'criarpedido bloqueado: ' + vagasRes.erro, { curso: vagasRes.curso, dataTurma: dataTurma, turma_nao_aberta: !!vagasRes.turma_nao_aberta });
      return { ok: false, erro: vagasRes.erro, turma_cheia: !vagasRes.turma_nao_aberta, turma_nao_aberta: !!vagasRes.turma_nao_aberta, restantes: vagasRes.restantes, curso: vagasRes.curso };
    }

    pedidoId = 'PED' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
    var now = new Date();

    /* Cria o pagamento ANTES de gravar: se falhar, nada é gravado e
       nenhuma vaga fica presa. O id entra na própria linha do pedido. */
    var prefId = '';
    var pagId = '';
    if (total > 0) {
      var primeiroEmail = String((pessoas[0] && pessoas[0].email) || '').trim();
      if (metodo === 'cartao') {
        var pref = criarPreferenciaMPPedido(pedidoId, total, primeiroEmail);
        if (!pref || !pref.init_point) { if (cid) soltarClaim(cid); return { ok: false, pedido: pedidoId, erro: 'Não foi possível criar o pagamento.' }; }
        prefId = String(pref.id || '');
        pagInfo = { tipo: 'cartao', url: pref.init_point };
      } else if (metodo === 'pixmp' || metodo === 'pix_mp') {
        var pix = criarPixMPPedido(pedidoId, total, primeiroEmail);
        if (!pix || !pix.ok) { if (cid) soltarClaim(cid); return { ok: false, pedido: pedidoId, erro: (pix && pix.erro) || 'Não foi possível gerar o Pix.' }; }
        pagId = String(pix.id || '');
        pagInfo = { tipo: 'pix', id: pix.id, qr: pix.qr, copia: pix.copia };
      }
    }

    var pSheet = getSheet('Pedidos');
    pSheet.appendRow([pedidoId, 'aguardando', bruto, desconto, total, metodo, formatDate(now), prefId, pagId, codigo, '', cid]);
    if (descCalc.tipo === 'cupom' || descCalc.tipo === 'reserva') usarCupom(codigo, pedidoId);

    var pesSheet = getSheet('Pessoas');
    var iSheet = getSheet('Inscritos');
    for (var p2 = 0; p2 < pessoas.length; p2++) {
      var pdata = pessoas[p2];
      var cpfNorm = normalizarCPF(String(pdata.cpf || '').trim());
      var areaToken = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
      var pessoaId = 'PS' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
      var codigoConvite = gerarCodigoConvite();
      var cursosDaPessoa = [];
      itens.forEach(function (it) {
        if (it.pessoa !== p2) return;
        cursosDaPessoa.push(it.curso);
        var rowId = generateId(iSheet);
        iSheet.appendRow([rowId, it.nome, it.whats, it.email, it.curso, dataTurma, PRECO_OFICINA, '', '', 'aguardando', 'não', formatDate(now), hashToken(areaToken), '', '', '', 'não', 'não', pedidoId, pessoaId, codigoConvite, 0, '', cpfNorm]);
      });
      pesSheet.appendRow([pessoaId, pedidoId, String(pdata.nome || '').trim(), String(pdata.whatsapp || '').trim(), String(pdata.email || '').trim(), hashToken(areaToken), areaToken, cursosDaPessoa.join(', '), 'não', codigoConvite, 0, '', cpfNorm]);
      pessoasCriadas.push({ pessoaId: pessoaId, nome: String(pdata.nome || '').trim(), email: String(pdata.email || '').trim(), cursos: cursosDaPessoa });
    }
  } finally { try { vlock.releaseLock(); } catch (eR2) {} }

  if (total <= 0) {
    finalizarPedido(pedidoId);
    var respZ = { ok: true, pedido: pedidoId, bruto: bruto, desconto: desconto, total: 0, status: 'pago', creditado: true };
    if (cid) cacheRespostaPedido(cid, respZ);
    return respZ;
  }

  if (pagInfo && pagInfo.tipo === 'cartao') {
    var respC = { ok: true, pedido: pedidoId, bruto: bruto, desconto: desconto, total: total, url: pagInfo.url, pessoas: pessoasCriadas };
    if (cid) cacheRespostaPedido(cid, respC);
    return respC;
  }
  if (pagInfo && pagInfo.tipo === 'pix') {
    var respP = { ok: true, pedido: pedidoId, bruto: bruto, desconto: desconto, total: total, id: pagInfo.id, qr: pagInfo.qr, copia: pagInfo.copia, pessoas: pessoasCriadas };
    if (cid) cacheRespostaPedido(cid, respP);
    return respP;
  }
  var respM = { ok: true, pedido: pedidoId, bruto: bruto, desconto: desconto, total: total, manual: true, pessoas: pessoasCriadas };
  if (cid) cacheRespostaPedido(cid, respM);
  return respM;
}

function buscarPedidoPorCid(cid) {
  try {
    var pSheet = getSheet('Pedidos');
    var rows = pSheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][11] || '') === String(cid)) {
        return { ok: true, pedido: rows[i][0], status: rows[i][1], bruto: rows[i][2], desconto: rows[i][3], total: rows[i][4], forma: rows[i][5], duplicado: true };
      }
    }
  } catch (err) {}
  return null;
}
function cacheRespostaPedido(cid, resp) {
  try { CacheService.getScriptCache().put('resp:' + cid, JSON.stringify(resp), 7200); } catch (e) {}
}
function soltarClaim(cid) {
  try { CacheService.getScriptCache().remove('claim:' + cid); } catch (e) {}
}

function criarPreferenciaMPPedido(pedidoId, total, email) {
  var token = getMPToken();
  if (!token) throw new Error('MP_ACCESS_TOKEN não configurado.');
  var payload = {
    external_reference: pedidoId,
    notification_url: getWebAppUrl(),
    statement_descriptor: 'PAO DE VERDADE',
    items: [{ id: pedidoId, title: 'Oficinas Pão de Verdade', quantity: 1, unit_price: total, currency_id: 'BRL', category_id: 'course' }],
    payer: { name: 'Cliente', email: email || 'sem@email.com' },
    back_urls: { success: 'https://ferrarijonas.github.io/paodeverdade/checkout.html?pagamento=aprovado', pending: 'https://ferrarijonas.github.io/paodeverdade/checkout.html?pagamento=pendenciante', failure: 'https://ferrarijonas.github.io/paodeverdade/checkout.html?pagamento=recusado' },
    auto_return: 'approved'
  };
  var res = UrlFetchApp.fetch(MP_API + '/checkout/preferences', {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var data = JSON.parse(res.getContentText());
  if (code >= 400 || !data.id) { Logger.log('MP pedido erro: ' + code + ' ' + res.getContentText()); return null; }
  return data;
}

function criarPixMPPedido(pedidoId, total, email) {
  var token = getMPToken();
  if (!token) return { ok: false, erro: 'MP não configurado.' };
  var payload = {
    transaction_amount: total,
    description: 'Oficinas Pão de Verdade',
    payment_method_id: 'pix',
    external_reference: pedidoId,
    notification_url: getWebAppUrl(),
    payer: { email: email || 'sem@email.com' }
  };
  var res = UrlFetchApp.fetch(MP_API + '/v1/payments', {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var data = JSON.parse(res.getContentText());
  if (code >= 400 || !data || !data.id) { Logger.log('MP pix pedido erro: ' + code + ' ' + res.getContentText()); return { ok: false, erro: 'Não foi possível gerar o Pix.' }; }
  var td = data.point_of_interaction && data.point_of_interaction.transaction_data ? data.point_of_interaction.transaction_data : {};
  return { ok: true, id: data.id, qr: td.qr_code_base64 || '', copia: td.qr_code || '' };
}

function statusPedido(pedidoId) {
  if (!pedidoId) return { status: 'pending' };
  var pSheet = getSheet('Pedidos');
  var rows = pSheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(pedidoId)) continue;
    var status = String(rows[i][1] || '').trim();
    if (status === 'pago') return { status: 'approved' };
    var paymentId = rows[i][8];
    if (paymentId) {
      var pag = consultarPagamento(paymentId);
      if (pag && pag.status === 'approved') { finalizarPedido(pedidoId); return { status: 'approved' }; }
    }
    return { status: 'pending' };
  }
  return { status: 'pending' };
}

function confirmarPedido(pedidoId) {
  if (!pedidoId) return { ok: false, erro: 'Pedido inválido.' };
  finalizarPedido(pedidoId);
  return { ok: true };
}

function excluirPedido(pedidoId) {
  if (!pedidoId) return { ok: false, erro: 'Pedido inválido.' };
  var iSheet = getSheet('Inscritos');
  var iRows = iSheet.getDataRange().getValues();
  for (var i = iRows.length - 1; i >= 1; i--) {
    if (String(iRows[i][18]) === String(pedidoId)) iSheet.deleteRow(i + 1);
  }
  var pesSheet = getSheet('Pessoas');
  var pesRows = pesSheet.getDataRange().getValues();
  for (var j = pesRows.length - 1; j >= 1; j--) {
    if (String(pesRows[j][1]) === String(pedidoId)) pesSheet.deleteRow(j + 1);
  }
  var pSheet = getSheet('Pedidos');
  var pRows = pSheet.getDataRange().getValues();
  for (var k = pRows.length - 1; k >= 1; k--) {
    if (String(pRows[k][0]) === String(pedidoId)) pSheet.deleteRow(k + 1);
  }
  return { ok: true };
}

function cancelarPedidoComCredito(d) {
  if (!getFeature('FEATURE_CANCELAMENTO')) {
    return { ok: false, erro: 'O cancelamento com crédito está desligado no painel. Chama a gente no WhatsApp.', desligado: true };
  }
  var pedido = String(d.pedido || '').trim();
  if (!pedido) return { ok: false, erro: 'Pedido inválido.' };
  var token = String(d.token || '').trim();
  var isAdmin = d.senha && d.senha === getPainelSenha();

  var pSheet = getSheet('Pedidos');
  var pRows = pSheet.getDataRange().getValues();
  var iSheet = getSheet('Inscritos');
  var iRows = iSheet.getDataRange().getValues();

  var pedidoRow = -1;
  for (var i = 1; i < pRows.length; i++) {
    if (String(pRows[i][0]) === pedido) { pedidoRow = i; break; }
  }
  if (pedidoRow < 0) return { ok: false, erro: 'Pedido não encontrado.' };

  if (!isAdmin) {
    if (!token || token.length < 20) return { ok: false, erro: 'Link inválido.' };
    var hash = hashToken(token);
    var achou = false;
    var dataTurma = '';
    for (var k = 1; k < iRows.length; k++) {
      if (String(iRows[k][18]) !== pedido) continue;
      if (!dataTurma) dataTurma = normalizarData(iRows[k][5]);
      if (String(iRows[k][12] || '') === hash) achou = true;
    }
    if (!achou) {
      var pesSheet = getSheet('Pessoas');
      var pesRows = pesSheet.getDataRange().getValues();
      for (var pp = 1; pp < pesRows.length; pp++) {
        if (String(pesRows[pp][1]) === pedido && String(pesRows[pp][5] || '') === hash) { achou = true; break; }
      }
    }
    if (!achou) return { ok: false, erro: 'Você não tem permissão para cancelar este pedido.' };
    if (dataTurma) {
      var dp = dataTurma.split('/');
      var dTurma = new Date(Number(dp[2]), Number(dp[1]) - 1, Number(dp[0]));
      var limite = new Date(new Date().getTime() + 5 * 24 * 60 * 60 * 1000);
      if (isNaN(dTurma.getTime()) || dTurma.getTime() < limite.getTime()) {
        return { ok: false, erro: 'Faltam menos de 5 dias para a oficina. Chama a gente no WhatsApp (34) 93618-6847 que resolvemos rapidinho.', janela: false };
      }
    }
  }

  var lock = LockService.getScriptLock();
  var lockOk = false;
  try { lockOk = lock.tryLock(10000); } catch (eL) {}
  if (!lockOk) return { ok: false, erro: 'Servidor ocupado. Tente novamente em instantes.' };

  try {
    pRows = pSheet.getDataRange().getValues();
    pedidoRow = -1;
    for (var j = 1; j < pRows.length; j++) {
      if (String(pRows[j][0]) === pedido) { pedidoRow = j; break; }
    }
    if (pedidoRow < 0) return { ok: false, erro: 'Pedido não encontrado.' };
    if (String(pRows[pedidoRow][1] || '').trim() !== 'pago') {
      return { ok: false, erro: 'Este pedido ainda não está pago.' };
    }
    var total = Number(pRows[pedidoRow][4] || 0);
    if (!(total > 0)) total = 0;

    var creditoCodigo = '';
    if (total > 0) {
      var ativo = buscarCupomCreditoPorPedido(pedido);
      if (ativo) {
        creditoCodigo = ativo.codigo;
      } else {
        var cup = gerarCupom({ tipo: 'valor', valor: total, label: 'CRED' });
        if (!cup || !cup.ok) return { ok: false, erro: (cup && cup.erro) || 'Não foi possível gerar o crédito.' };
        creditoCodigo = cup.codigo;
        var cupSheet = getSheet('Cupons');
        var cupRows = cupSheet.getDataRange().getValues();
        for (var c2 = 1; c2 < cupRows.length; c2++) {
          if (String(cupRows[c2][0]) === creditoCodigo) {
            cupSheet.getRange(c2 + 1, 7).setValue(pedido);
            cupSheet.getRange(c2 + 1, 8).setValue('crédito cancelamento');
            break;
          }
        }
      }
    }

    for (var c = 1; c < iRows.length; c++) {
      if (String(iRows[c][18]) === pedido) {
        iSheet.getRange(c + 1, 10).setValue('cancelado');
      }
    }
    pSheet.getRange(pedidoRow + 1, 2).setValue('cancelado');

    if (total > 0) {
      registrarLog('cancelado', pedido, 'Cancelamento → crédito R$ ' + total.toFixed(2) + ' (' + creditoCodigo + ')');
      return { ok: true, pedido: pedido, creditoCodigo: creditoCodigo, creditoValor: total };
    }
    registrarLog('cancelado', pedido, 'Cancelamento de pedido gratuito (crédito já usado) — vaga liberada');
    return { ok: true, pedido: pedido, creditoCodigo: '', creditoValor: 0, gratuito: true };
  } finally {
    try { lock.releaseLock(); } catch (eR) {}
  }
}

function buscarCupomCreditoPorPedido(pedido) {
  var sheet = getSheet('Cupons');
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][6] || '').trim() !== String(pedido)) continue;
    if (String(rows[i][3] || '').trim().toLowerCase() !== 'ativo') continue;
    return { codigo: String(rows[i][0] || ''), valor: Number(rows[i][2] || 0) };
  }
  return null;
}

function finalizarPedido(pedidoId) {
  var pSheet = getSheet('Pedidos');
  var pRows = pSheet.getDataRange().getValues();
  var jaEraPago = false;
  for (var i = 1; i < pRows.length; i++) {
    if (String(pRows[i][0]) !== String(pedidoId)) continue;
    if (String(pRows[i][1] || '').trim() === 'cancelado') return;
    jaEraPago = String(pRows[i][1] || '').trim() === 'pago';
    pSheet.getRange(i + 1, 2).setValue('pago');
    break;
  }
  var pesSheet = getSheet('Pessoas');
  var pesRows = pesSheet.getDataRange().getValues();
  var pessoaIds = [];
  for (var j = 1; j < pesRows.length; j++) {
    if (String(pesRows[j][1]) !== String(pedidoId)) continue;
    pessoaIds.push({ id: pesRows[j][0], row: j + 1 });
  }
  var iSheet = getSheet('Inscritos');
  var iRows = iSheet.getDataRange().getValues();
  for (var k = 1; k < iRows.length; k++) {
    if (String(iRows[k][18]) !== String(pedidoId)) continue;
    if (String(iRows[k][9] || '').trim() !== 'pago') {
      iSheet.getRange(k + 1, 10).setValue('pago');
    }
  }
  pessoaIds.forEach(function (pessoa) {
    enviarAcessoPessoa(pessoa.id, pessoa.row);
  });
  creditarReferenciador(pedidoId);
  if (!jaEraPago) {
    registrarLog('pago', pedidoId, 'Pagamento confirmado');
    try { fazerBackup(); } catch (eB) { Logger.log('Backup: ' + eB); }
    notificarVendaTelegram(pedidoId);
  }
}

function enviarAcessoPessoa(pessoaId, pessoaRow) {
  var pesSheet = getSheet('Pessoas');
  var r = pesSheet.getRange(pessoaRow, 1, 1, 9).getValues()[0];
  var nome = String(r[2] || '').trim();
  var email = String(r[4] || '').trim();
  var token = String(r[6] || '').trim();
  var cursos = String(r[7] || '').trim();
  if (!email) return;
  if (String(r[8] || '').toLowerCase() === 'sim') return;
  var link = 'https://ferrarijonas.github.io/paodeverdade/aluno.html?token=' + encodeURIComponent(token);
  var corpo = '<div style="font-family:Segoe UI,Arial,sans-serif;color:#212121;max-width:560px;margin:0 auto">' +
    '<h2 style="color:#4A2E1B">Oi, ' + esc(nome) + '!</h2>' +
    '<p>Sua inscrição foi confirmada' + (cursos ? ' nas oficinas de <strong>' + esc(cursos) + '</strong>' : '') + '.</p>' +
    '<p><a href="' + esc(link) + '" style="display:inline-block;background:#212121;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700">Abrir minha Área do Estudante</a></p>' +
    '<p>Por lá você encontra os materiais, o link do grupo e, depois da oficina, o certificado.</p>' +
    '<p style="color:#8A7A5C;font-size:.85rem">Pão de Verdade — Forneria Artesanal</p></div>';
  GmailApp.sendEmail(email, 'Sua Área do Estudante — Pão de Verdade', 'Acesse sua Área do Estudante: ' + link, { htmlBody: corpo });
  pesSheet.getRange(pessoaRow, 9).setValue('sim');
}

/* ---------------------------------------------------------
   CONVITE / CRÉDITO (give & get)
   Cada aluno pago tem um código de convite. Quem usa o código
   de outra pessoa ganha 15% de desconto e o dono do código
   ganha 15% de crédito para o próximo curso. Se a pessoa usa
   o próprio código, aplica o saldo de crédito que ela tem.
   --------------------------------------------------------- */
function gerarCodigoConvite() {
  var alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var s = '';
  for (var i = 0; i < 8; i++) s += alpha.charAt(Math.floor(Math.random() * alpha.length));
  return 'CONV-' + s;
}

function buscarConvite(codigo) {
  var c = String(codigo || '').trim().toUpperCase();
  if (!c) return null;
  try {
    var pesSheet = getSheet('Pessoas');
    var pesRows = pesSheet.getDataRange().getValues();
    for (var i = 1; i < pesRows.length; i++) {
      if (String(pesRows[i][9] || '').trim().toUpperCase() === c) {
        return { tipo: 'pessoas', row: i, email: String(pesRows[i][4] || '').trim().toLowerCase(), credito: Number(pesRows[i][10] || 0) };
      }
    }
  } catch (err) {}
  var iSheet = getSheet('Inscritos');
  var iRows = iSheet.getDataRange().getValues();
  for (var j = 1; j < iRows.length; j++) {
    if (String(iRows[j][20] || '').trim().toUpperCase() === c) {
      return { tipo: 'inscritos', row: j, email: String(iRows[j][3] || '').trim().toLowerCase(), credito: Number(iRows[j][21] || 0) };
    }
  }
  return null;
}

function calcularDescontoPedido(itens, pessoas, codigo) {
  var bruto = itens * PRECO_OFICINA;
  if (!codigo) {
    var d = itens >= 2 ? Math.round(bruto * 0.15 * 100) / 100 : 0;
    return { desconto: d, tipo: d ? 'duo' : '' };
  }
  var cup = buscarCupom(codigo);
  if (cup) {
    if (cup.status !== 'ativo') return { erro: 'Cupom já utilizado ou expirado.' };
    if (cup.tipo === 'reserva') {
      var descontoReserva = Math.min(100, Math.max(0, parseInt(String(cup.valor || '0').replace(/\D/g, ''), 10) || 0));
      var dr = Math.round(bruto * descontoReserva / 100 * 100) / 100;
      return { desconto: dr, tipo: 'reserva' };
    }
    var descontoCupom = cup.tipo === 'valor' ? Math.min(cup.valor, bruto) : Math.round(bruto * cup.valor / 100 * 100) / 100;
    return { desconto: descontoCupom, tipo: 'cupom' };
  }
  var convite = buscarConvite(codigo);
  if (!convite) return { erro: 'Código de desconto inválido.' };
  var emails = [];
  pessoas.forEach(function (p) {
    var e = String(p.email || '').trim().toLowerCase();
    if (e) emails.push(e);
  });
  var proprio = emails.indexOf(convite.email) !== -1;
  var teto = Math.round(bruto * 0.15 * 100) / 100;
  if (proprio) {
    var usar = Math.min(convite.credito, teto);
    if (usar <= 0) return { erro: 'Seu crédito ainda não está disponível. Use o código de quem te convidou.' };
    return { desconto: usar, tipo: 'credito' };
  }
  return { desconto: teto, tipo: 'convite' };
}

function creditarReferenciador(pedidoId) {
  var pSheet = getSheet('Pedidos');
  var pRows = pSheet.getDataRange().getValues();
  var codigo = '', total = 0;
  for (var i = 1; i < pRows.length; i++) {
    if (String(pRows[i][0]) === String(pedidoId)) {
      codigo = String(pRows[i][9] || '').trim();
      total = Number(pRows[i][4] || 0);
      break;
    }
  }
  if (!codigo || total <= 0) return;
  var convite = buscarConvite(codigo);
  if (!convite) return;
  var pesSheet = getSheet('Pessoas');
  var pesRows = pesSheet.getDataRange().getValues();
  var emails = [];
  for (var j = 1; j < pesRows.length; j++) {
    if (String(pesRows[j][1]) === String(pedidoId)) emails.push(String(pesRows[j][4] || '').trim().toLowerCase());
  }
  var proprio = emails.indexOf(convite.email) !== -1;
  if (proprio) {
    if (convite.tipo === 'pessoas') pesSheet.getRange(convite.row + 1, 11).setValue(0);
    else getSheet('Inscritos').getRange(convite.row + 1, 22).setValue(0);
    return;
  }
  var acrescimo = Math.round(total * 0.15 * 100) / 100;
  if (convite.tipo === 'pessoas') {
    pesSheet.getRange(convite.row + 1, 11).setValue(Math.round((convite.credito + acrescimo) * 100) / 100);
  } else {
    getSheet('Inscritos').getRange(convite.row + 1, 22).setValue(Math.round((convite.credito + acrescimo) * 100) / 100);
  }
}

function validarCodigo(codigo) {
  var c = String(codigo || '').trim().toUpperCase();
  if (!c) return { ok: false, erro: '' };
  var cupom = buscarCupom(c);
  if (cupom && cupom.status === 'ativo') {
    if (cupom.tipo === 'reserva') {
      var reserva = buscarReserva(c);
      if (!reserva) return { ok: false, erro: 'Reserva inválida.' };
      return { ok: true, msg: 'Vaga reservada para você — ' + reserva.curso + ' ' + reserva.dataTurma + '!', tipo: 'reserva', reserva: reserva, valor: reserva.desconto };
    }
    return { ok: true, msg: 'Cupom válido! Desconto aplicado.', tipo: cupom.tipo, valor: cupom.valor };
  }
  var convite = buscarConvite(c);
  if (!convite) return { ok: false, erro: 'Código inválido. Confira e tente novamente.' };
  return { ok: true, msg: 'Código válido! Desconto de 15% aplicado.', tipo: 'convite' };
}

/* ---------------------------------------------------------
   CUPONS ESPECIAIS (casos específicos, ex.: casal)
   O admin gera um cupom com % ou valor fixo; o cliente usa no
   checkout como se fosse um código de convite. Uso único.
   --------------------------------------------------------- */
function gerarCupom(d) {
  var tipo = (d.tipo === 'valor') ? 'valor' : 'pct';
  var valor = Number(d.valor);
  if (!valor || valor <= 0) return { ok: false, erro: 'Informe um valor de desconto válido.' };
  if (tipo === 'pct' && valor > 100) return { ok: false, erro: 'Percentual não pode passar de 100%.' };
  var label = String(d.label || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  var sheet = getSheet('Cupons');
  var codigo;
  for (var t = 0; t < 20; t++) {
    var suffix = '';
    var alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (var i = 0; i < 4; i++) suffix += alpha.charAt(Math.floor(Math.random() * alpha.length));
    codigo = (label ? label + '-' : 'CUPOM-') + suffix;
    if (!buscarCupom(codigo)) break;
  }
  sheet.appendRow([codigo, tipo, valor, 'ativo', formatDate(new Date()), '', '', String(d.label || '').trim()]);
  return { ok: true, codigo: codigo, tipo: tipo, valor: valor };
}

function buscarCupom(codigo) {
  var c = String(codigo || '').trim().toUpperCase();
  if (!c) return null;
  try {
    var sheet = getSheet('Cupons');
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0] || '').trim().toUpperCase() === c) {
        return { row: i + 1, codigo: String(rows[i][0]), tipo: String(rows[i][1] || 'pct'), valor: Number(rows[i][2] || 0), status: String(rows[i][3] || '').trim().toLowerCase() };
      }
    }
  } catch (err) {}
  return null;
}

function usarCupom(codigo, pedidoId) {
  var cupom = buscarCupom(codigo);
  if (!cupom) return;
  var sheet = getSheet('Cupons');
  sheet.getRange(cupom.row, 4).setValue('usado');
  sheet.getRange(cupom.row, 6).setValue(formatDate(new Date()));
  sheet.getRange(cupom.row, 7).setValue(pedidoId);
  try { CacheService.getScriptCache().remove('turmas_vagas'); } catch (eC) {}
}

function listarCupons() {
  try {
    var sheet = getSheet('Cupons');
    var rows = sheet.getDataRange().getValues();
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      out.push({
        codigo: rows[i][0], tipo: rows[i][1], valor: rows[i][2], status: rows[i][3],
        criadoEm: formatarRegistro(rows[i][4]), usadoEm: formatarRegistro(rows[i][5]),
        pedidoId: rows[i][6], anotacao: rows[i][7],
        reservaCurso: rows[i][8], reservaData: rows[i][9], reservaVagas: rows[i][10]
      });
    }
    return out;
  } catch (err) { return []; }
}

function reativarCupom(codigo) {
  var cupom = buscarCupom(codigo);
  if (!cupom) return { ok: false, erro: 'Cupom não encontrado.' };
  var sheet = getSheet('Cupons');
  var criadoEm = sheet.getRange(cupom.row, 5).getValue();
  sheet.getRange(cupom.row, 4, 1, 4).setValues([['ativo', criadoEm, '', '']]);
  return { ok: true };
}

function excluirCupom(codigo) {
  var cupom = buscarCupom(codigo);
  if (!cupom) return { ok: false, erro: 'Cupom não encontrado.' };
  getSheet('Cupons').deleteRow(cupom.row);
  return { ok: true };
}

/* ---------------------------------------------------------
   VENDA RESERVADA (link direto)
   Reserva N vagas de uma turma para uma pessoa. O cupom tipo
   'reserva' guarda curso/data/vagas nas colunas 9-11 e o desconto
   % na coluna Valor. Enquanto ativo, as vagas reservadas saem da
   disponibilidade pública (site mostra turma cheia). Quem tem o
   link compra liberado, com desconto se configurado.
   --------------------------------------------------------- */
function reservarVaga(d) {
  var curso = normalizarCurso(d.curso || '');
  var data = normalizarData(d.dataTurma || d.data || '');
  var vagas = parseInt(String(d.vagas || '1').replace(/\D/g, ''), 10) || 1;
  var rotulo = String(d.rotulo || d.label || '').trim();
  var desconto = Math.min(100, Math.max(0, parseInt(String(d.desconto || '0').replace(/\D/g, ''), 10) || 0));
  if (!curso || !data) return { ok: false, erro: 'Informe curso e data da turma.' };
  if (!turmaAberta(curso, data)) return { ok: false, erro: 'Turma não encontrada.' };
  if (vagas < 1 || vagas > 4) return { ok: false, erro: 'Nº de vagas reservadas deve ser 1 a 4.' };
  var codigo;
  var alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (var t = 0; t < 30; t++) {
    var suffix = '';
    for (var i = 0; i < 4; i++) suffix += alpha.charAt(Math.floor(Math.random() * alpha.length));
    var prefixo = rotulo ? rotulo.replace(/[^A-Z0-9]/g, '').toUpperCase().slice(0, 6) : 'RESV';
    codigo = prefixo + '-' + suffix;
    if (!buscarCupom(codigo)) break;
  }
  var sheet = getSheet('Cupons');
  sheet.appendRow([codigo, 'reserva', desconto, 'ativo', formatDate(new Date()), '', '', rotulo, curso, data, vagas]);
  try { CacheService.getScriptCache().remove('turmas_vagas'); } catch (eC) {}
  var link = 'checkout.html?curso=' + encodeURIComponent(curso) +
    '&data=' + encodeURIComponent(data) +
    '&codigo=' + encodeURIComponent(codigo);
  return { ok: true, codigo: codigo, link: link, curso: curso, dataTurma: data, vagas: vagas, rotulo: rotulo, desconto: desconto };
}

function buscarReserva(codigo) {
  var c = String(codigo || '').trim().toUpperCase();
  if (!c) return null;
  var cupom = buscarCupom(c);
  if (!cupom || cupom.tipo !== 'reserva' || cupom.status !== 'ativo') return null;
  try {
    var sheet = getSheet('Cupons');
    var rows = sheet.getDataRange().getValues();
    var col = sheet.getLastColumn();
    var cel = sheet.getRange(cupom.row, 1, 1, Math.max(col, 11)).getValues()[0];
    return {
      codigo: c,
      curso: normalizarCurso(cel[8] || ''),
      dataTurma: normalizarData(cel[9] || ''),
      vagas: parseInt(String(cel[10] || '1').replace(/\D/g, ''), 10) || 1,
      desconto: parseInt(String(cel[2] || '0').replace(/\D/g, ''), 10) || 0
    };
  } catch (err) { return null; }
}

function reservasAtivas(curso, dataTurma) {
  var total = 0;
  try {
    var sheet = getSheet('Cupons');
    var rows = sheet.getDataRange().getValues();
    var alvoCurso = normalizarCurso(curso);
    var alvoData = normalizarData(dataTurma);
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][1] || '').trim().toLowerCase() !== 'reserva') continue;
      if (String(rows[i][3] || '').trim().toLowerCase() !== 'ativo') continue;
      if (normalizarCurso(rows[i][8]) !== alvoCurso) continue;
      if (normalizarData(rows[i][9]) !== alvoData) continue;
      total += parseInt(String(rows[i][10] || '1').replace(/\D/g, ''), 10) || 1;
    }
  } catch (err) {}
  return total;
}

/* ---------------------------------------------------------
   LEMBRETE DE CRÉDITO
   Crédito sem prazo: a cada turma futura com vaga, lembra
   quem tem cupom de crédito ativo até ele ser usado.
   Roda manual (?acao=lembrarcreditos) ou por trigger diário.
   --------------------------------------------------------- */
function lembrarCreditosTrigger() {
  try { executarLembretes(); } catch (err) { Logger.log('Lembrete: ' + err); }
}

function criarTriggerLembrete() {
  try {
    ScriptApp.getProjectTriggers().forEach(function (tr) {
      if (tr.getHandlerFunction() === 'lembrarCreditosTrigger') ScriptApp.deleteTrigger(tr);
    });
    ScriptApp.newTrigger('lembrarCreditosTrigger').timeBased().everyDays(1).atHour(9).create();
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: String(err) };
  }
}

function buscarContatoPorPedido(pedido) {
  try {
    var iSheet = getSheet('Inscritos');
    var iRows = iSheet.getDataRange().getValues();
    for (var i = 1; i < iRows.length; i++) {
      if (String(iRows[i][18] || '') !== String(pedido)) continue;
      return { nome: String(iRows[i][1] || '').trim(), whats: String(iRows[i][2] || '').trim(), email: String(iRows[i][3] || '').trim() };
    }
  } catch (err) {}
  return null;
}

/* ---------------------------------------------------------
   LEMBRETES AGENDÁVEIS (painel)
   O admin programa lembretes por canal (e-mail / WhatsApp via
   ponte Baileys) e público (crédito / inscritos de uma turma).
   O executor roda no trigger diário e no botão "Executar agora".
   --------------------------------------------------------- */
function normCursoKey(v) {
  var s = String(v || '').toLowerCase().replace(/[àáâãä]/g, 'a').replace(/[óòôõö]/g, 'o');
  if (s.indexOf('pizza') !== -1) return 'pizza';
  if (s.indexOf('pao') !== -1) return 'pao';
  return 'ambos';
}

function listarLembretes() {
  var sheet = getSheet('Lembretes');
  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    out.push({
      id: rows[i][0], titulo: rows[i][1], tipo: rows[i][2], canal: rows[i][3],
      curso: rows[i][4], diasAntes: Number(rows[i][5] || 0), mensagem: rows[i][6],
      ativo: String(rows[i][7] || '').trim().toLowerCase() === 'sim',
      criadoEm: formatarRegistro(rows[i][8]), ultimoEnvio: formatarRegistro(rows[i][9])
    });
  }
  return out;
}

function criarLembrete(d) {
  var titulo = String(d.titulo || '').trim();
  var tipo = String(d.tipo || 'credito').trim();
  var canal = String(d.canal || 'email').trim();
  var curso = String(d.curso || 'Ambos').trim();
  var diasAntes = Math.max(0, parseInt(String(d.diasAntes || '0'), 10) || 0);
  var mensagem = String(d.mensagem || '').trim();
  if (!titulo) return { ok: false, erro: 'Dê um título ao lembrete.' };
  if (!mensagem) return { ok: false, erro: 'Escreva a mensagem (use {nome}, {curso}, {data}, {codigo}).' };
  var sheet = getSheet('Lembretes');
  var id = 'L' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  sheet.appendRow([id, titulo, tipo, canal, curso, diasAntes, mensagem, 'sim', formatDate(new Date()), '']);
  return { ok: true, id: id };
}

function excluirLembrete(id) {
  var sheet = getSheet('Lembretes');
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) { sheet.deleteRow(i + 1); return { ok: true }; }
  }
  return { ok: false, erro: 'Lembrete não encontrado.' };
}

function alternarLembrete(id, ativo) {
  var sheet = getSheet('Lembretes');
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      sheet.getRange(i + 1, 8).setValue(ativo ? 'sim' : 'não');
      return { ok: true, id: id, ativo: ativo };
    }
  }
  return { ok: false, erro: 'Lembrete não encontrado.' };
}

function preencherMsg(t, a) {
  var m = String(t || '');
  m = m.replace(/\{nome\}/g, a.nome || '');
  m = m.replace(/\{curso\}/g, a.curso || '');
  m = m.replace(/\{data\}/g, a.dataTurma || '');
  m = m.replace(/\{codigo\}/g, a.codigo || '');
  m = m.replace(/\{titulo\}/g, a.titulo || '');
  return m;
}

function enviarEmailLembrete(email, msg, titulo) {
  try {
    GmailApp.sendEmail(email, titulo || 'Pão de Verdade', msg);
  } catch (e) { Logger.log('e-mail lembrete: ' + e); }
}

function enviarZapBridge(whats, msg) {
  try {
    var url = String(PROPS.getProperty('WHATSAPP_BRIDGE_URL') || '').trim();
    var token = String(PROPS.getProperty('BRIDGE_TOKEN') || '').trim();
    if (!url || !token) { Logger.log('Ponte WhatsApp não configurada (WHATSAPP_BRIDGE_URL / BRIDGE_TOKEN).'); return false; }
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ token: token, to: String(whats).replace(/\D/g, ''), message: msg }),
      muteHttpExceptions: true
    });
    return res.getResponseCode() >= 200 && res.getResponseCode() < 300;
  } catch (e) { Logger.log('zap bridge: ' + e); return false; }
}

function alvosCreditoLembrete() {
  var out = [];
  var cupSheet = getSheet('Cupons');
  var rows = cupSheet.getDataRange().getValues();
  var turmas = listarTurmasComVagas(false);
  var agora = new Date();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][3] || '').trim().toLowerCase() !== 'ativo') continue;
    var pid = String(rows[i][6] || '').trim();
    if (!pid) continue;
    var anot = String(rows[i][7] || '');
    if (anot.indexOf('crédito cancelamento') === -1) continue;
    var contato = buscarContatoPorPedido(pid);
    if (!contato || (!contato.email && !contato.whats)) continue;
    var t = null;
    for (var k = 0; k < turmas.length; k++) {
      var p = normalizarData(turmas[k].dataTurma);
      var q = String(p).split('/');
      var dt = new Date(Number(q[2]), Number(q[1]) - 1, Number(q[0]));
      if (isNaN(dt.getTime()) || dt.getTime() < agora.getTime()) continue;
      if (Number(turmas[k].restantes) <= 0) continue;
      t = turmas[k]; break;
    }
    if (!t) continue;
    out.push({
      nome: contato.nome, email: contato.email, whats: contato.whats,
      curso: t.curso, dataTurma: t.dataTurma, codigo: String(rows[i][0] || ''),
      cupRow: i + 1, anotacao: anot,
      dedup: 'credito|' + pid + '|' + normalizarCurso(t.curso) + '|' + t.dataTurma
    });
  }
  return out;
}

function alvosTurmaLembrete(curso, diasAntes) {
  var out = [];
  var turmas = listarTurmasComVagas(false);
  var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  var alvo = null;
  for (var k = 0; k < turmas.length; k++) {
    if (normCursoKey(curso) !== 'ambos' && normCursoKey(turmas[k].curso) !== normCursoKey(curso)) continue;
    var p = normalizarData(turmas[k].dataTurma);
    var q = String(p).split('/');
    var dt = new Date(Number(q[2]), Number(q[1]) - 1, Number(q[0]));
    dt.setHours(0, 0, 0, 0);
    var diff = Math.round((dt.getTime() - hoje.getTime()) / (24 * 3600 * 1000));
    if (diff === diasAntes) { alvo = turmas[k]; break; }
  }
  if (!alvo) return out;
  var iSheet = getSheet('Inscritos');
  var iRows = iSheet.getDataRange().getValues();
  var visto = {};
  for (var i = 1; i < iRows.length; i++) {
    if (String(iRows[i][9] || '').trim() !== 'pago') continue;
    if (normCursoKey(iRows[i][4]) !== normCursoKey(alvo.curso)) continue;
    if (normalizarData(iRows[i][5]) !== normalizarData(alvo.dataTurma)) continue;
    var email = String(iRows[i][3] || '').trim();
    var whats = String(iRows[i][2] || '').trim();
    var key = email || whats;
    if (!key || visto[key]) continue;
    visto[key] = 1;
    out.push({
      nome: String(iRows[i][1] || '').trim(), email: email, whats: whats,
      curso: alvo.curso, dataTurma: alvo.dataTurma, codigo: '',
      dedup: 'turma|' + key + '|' + alvo.curso + '|' + alvo.dataTurma
    });
  }
  return out;
}

function executarLembretes() {
  if (!getFeature('FEATURE_LEMBRETE')) return { ok: true, desligado: true, enviados: 0 };
  var sheet = getSheet('Lembretes');
  var rows = sheet.getDataRange().getValues();
  var cupSheet = getSheet('Cupons');
  var enviados = 0;
  var ja = {};
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][7] || '').trim().toLowerCase() !== 'sim') continue;
    var lemId = String(rows[i][0] || '');
    var titulo = String(rows[i][1] || 'Pão de Verdade').trim();
    var tipo = String(rows[i][2] || 'credito').trim();
    var canal = String(rows[i][3] || 'email').trim();
    var curso = String(rows[i][4] || 'Ambos').trim();
    var dias = Number(rows[i][5] || 0);
    var msgT = String(rows[i][6] || '');
    var alvos = (tipo === 'turma') ? alvosTurmaLembrete(curso, dias) : alvosCreditoLembrete();
    alvos.forEach(function (a) {
      var key = a.dedup || (lemId + '|' + (a.email || a.whats) + '|' + a.dataTurma);
      if (ja[key]) return;
      if (a.cupRow && a.anotacao.indexOf('lem:' + lemId + ':' + a.dataTurma) !== -1) return;
      ja[key] = 1;
      a.titulo = titulo;
      var msg = preencherMsg(msgT, a);
      var ok = false;
      if ((canal === 'email' || canal === 'ambos') && a.email) { enviarEmailLembrete(a.email, msg, titulo); ok = true; }
      if ((canal === 'zap' || canal === 'ambos') && a.whats) { if (enviarZapBridge(a.whats, msg)) ok = true; }
      if (ok) {
        if (a.cupRow) {
          try { cupSheet.getRange(a.cupRow, 8).setValue(a.anotacao + '; lem:' + lemId + ':' + a.dataTurma); } catch (e) {}
        }
        enviados++;
      }
    });
    try { sheet.getRange(i + 1, 10).setValue(formatDate(new Date())); } catch (e) {}
  }
  if (enviados) registrarLog('lembrete', '', 'Lembretes enviados: ' + enviados);
  return { ok: true, enviados: enviados };
}

/* ---------------------------------------------------------
   Cria a preferência de pagamento no Mercado Pago
   --------------------------------------------------------- */
function criarPreferenciaMP(info) {
  var token = getMPToken();
  if (!token) throw new Error('MP_ACCESS_TOKEN não configurado.');

  var baseUrl = 'https://ferrarijonas.github.io/paodeverdade/';
  var titulo = 'Oficina de ' + info.curso +
    (info.dataTurma ? ' · ' + info.dataTurma : '') +
    ' — ' + info.nome;

  var payload = {
    external_reference: String(info.id),
    notification_url: getWebAppUrl(),
    statement_descriptor: 'PAO DE VERDADE',
    items: [{
      id: String(info.id),
      title: titulo,
      quantity: 1,
      unit_price: info.valor,
      currency_id: 'BRL',
      category_id: 'course'
    }],
    payer: {
      name: info.nome,
      email: info.email,
      identification: { type: 'other', number: info.whats || '00000000000' }
    },
    payment_methods: {
      installments: 12
    },
    back_urls: {
      success: baseUrl + 'aluno.html?token=' + encodeURIComponent(info.token) + '&pagamento=aprovado',
      pending: baseUrl + 'index.html?pagamento=pendenciante',
      failure: baseUrl + 'index.html?pagamento=recusado'
    },
    auto_return: 'approved'
  };

  var res = UrlFetchApp.fetch(MP_API + '/checkout/preferences', {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var data = JSON.parse(res.getContentText());
  if (code >= 400) {
    Logger.log('MP erro ao criar preferência: ' + code + ' ' + res.getContentText());
    return null;
  }
  return data;
}

/* ---------------------------------------------------------
   WEBHOOK — Mercado Pago avisa que houve pagamento
   --------------------------------------------------------- */
function handleWebhook(d) {
  var paymentId = d.data && d.data.id ? d.data.id : (d.data_id || d.payment_id);
  if (!paymentId) return jsonOut({ ok: false, erro: 'Sem payment id' });

  var status = consultarPagamento(paymentId);
  if (!status) return jsonOut({ ok: false, erro: 'Não foi possível consultar o pagamento' });

  var ref = status.external_reference || '';

  if (String(ref).indexOf('PED') === 0) {
    if (status.status === 'approved') finalizarPedido(ref);
    return jsonOut({ ok: true });
  }

  var sheet = getSheet('Inscritos');
  var rows = sheet.getDataRange().getValues();
  var header = rows[0];

  for (var i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]) === String(ref)) {
      sheet.getRange(i + 1, 9).setValue(paymentId);          /* I: PaymentID  */
      sheet.getRange(i + 1, 10).setValue(status.status);      /* J: Status     */
      if (status.status === 'approved') {
        sheet.getRange(i + 1, 10).setValue('pago');
        enviaConviteSePossivel(i + 1);
        enviarAcessoAluno(i + 1);
      }
      break;
    }
  }
  return jsonOut({ ok: true });
}

function enviarAcessoAluno(row) {
  var sheet = getSheet('Inscritos');
  var r = sheet.getRange(row, 1, 1, 18).getValues()[0];
  var email = String(r[3] || '').trim();
  var nome = String(r[1] || '').trim();
  if (!email || String(r[16] || '').toLowerCase() === 'sim') return;

  var token = String(r[17] || '');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    sheet.getRange(row, 13).setValue(hashToken(token));
    sheet.getRange(row, 18).setValue(token);
  }

  var link = 'https://ferrarijonas.github.io/paodeverdade/aluno.html?token=' + encodeURIComponent(token);
  var corpo = '<div style="font-family:Segoe UI,Arial,sans-serif;color:#212121;max-width:560px;margin:0 auto">' +
    '<h2 style="color:#4A2E1B">Oi, ' + esc(nome) + '!</h2>' +
    '<p>Seu pagamento foi confirmado. Sua Área do Estudante já está disponível:</p>' +
    '<p><a href="' + esc(link) + '" style="display:inline-block;background:#212121;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700">Abrir minha Área do Estudante</a></p>' +
    '<p>Por lá você encontrará os materiais da oficina, o link do grupo e, depois do curso, o certificado.</p>' +
    '<p style="color:#8A7A5C;font-size:.85rem">Pão de Verdade — Forneria Artesanal</p></div>';
  GmailApp.sendEmail(email, 'Sua Área do Estudante — Pão de Verdade', 'Acesse sua Área do Estudante: ' + link, { htmlBody: corpo });
  sheet.getRange(row, 17).setValue('sim');
}

function regenerarAcessoPorEmail() {
  var ui = SpreadsheetApp.getUi();
  var resposta = ui.prompt('Regenerar Área do Aluno', 'Digite exatamente o e-mail da inscrição paga:', ui.ButtonSet.OK_CANCEL);
  if (resposta.getSelectedButton() !== ui.Button.OK) return;
  var email = resposta.getResponseText().trim().toLowerCase();
  var sheet = getSheet('Inscritos');
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][3] || '').trim().toLowerCase() !== email) continue;
    if (String(rows[i][9] || '').trim() !== 'pago') {
      ui.alert('Essa inscrição ainda não está marcada como paga.');
      return;
    }
    sheet.getRange(i + 1, 17).setValue('não');
    sheet.getRange(i + 1, 18).setValue('');
    sheet.getRange(i + 1, 13).setValue('');
    enviarAcessoAluno(i + 1);
    ui.alert('Novo acesso enviado para ' + email + '.');
    return;
  }
  ui.alert('E-mail pago não encontrado.');
}

function regenerarAcessoPorId(id) {
  var sheet = getSheet('Inscritos');
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(id)) continue;
    if (String(rows[i][9] || '').trim() !== 'pago') return { ok: false, erro: 'A inscrição ainda não está paga.' };
    if (!regenerarAcessoInscricao(i, rows)) return { ok: false, erro: 'Pessoa não encontrada.' };
    return { ok: true };
  }
  return { ok: false, erro: 'Inscrição não encontrada.' };
}

function regenerarAcessoInscricao(row, rowsSnapshot) {
  var pessoaId = String(rowsSnapshot[row][19] || '').trim();
  if (pessoaId) {
    var pesSheet = getSheet('Pessoas');
    var pesRows = pesSheet.getDataRange().getValues();
    for (var j = 1; j < pesRows.length; j++) {
      if (String(pesRows[j][0]) === pessoaId) {
        var novo = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
        pesSheet.getRange(j + 1, 6).setValue(hashToken(novo));
        pesSheet.getRange(j + 1, 7).setValue(novo);
        pesSheet.getRange(j + 1, 9).setValue('não');
        var iSheet = getSheet('Inscritos');
        for (var k = 1; k < rowsSnapshot.length; k++) {
          if (String(rowsSnapshot[k][19]) === pessoaId) iSheet.getRange(k + 1, 13).setValue(hashToken(novo));
        }
        enviarAcessoPessoa(String(pesRows[j][0]), j + 1);
        return true;
      }
    }
    return false;
  }
  var sheet = getSheet('Inscritos');
  sheet.getRange(row + 1, 17).setValue('não');
  sheet.getRange(row + 1, 18).setValue('');
  sheet.getRange(row + 1, 13).setValue('');
  enviarAcessoAluno(row + 1);
  return true;
}

function excluirInscrito(id) {
  var sheet = getSheet('Inscritos');
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, erro: 'Inscrição não encontrada.' };
}

/* ---------------------------------------------------------
   CONSOLE DE GESTÃO — ações do painel por inscrição
   --------------------------------------------------------- */
function atualizarInscricao(d) {
  var id = String(d.id || '');
  var sheet = getSheet('Inscritos');
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== id) continue;
    var nome = String(d.nome === undefined ? rows[i][1] : d.nome).trim();
    var whats = String(d.whatsapp === undefined ? rows[i][2] : d.whatsapp).trim();
    var email = String(d.email === undefined ? rows[i][3] : d.email).trim();
    if (!nome || !email) return { ok: false, erro: 'Nome e e-mail são obrigatórios.' };
    if (d.cpf !== undefined) {
      var cpfT = normalizarCPF(String(d.cpf));
      if (cpfT && !validarCPF(cpfT)) return { ok: false, erro: 'CPF inválido.' };
    }
    sheet.getRange(i + 1, 2).setValue(nome);
    sheet.getRange(i + 1, 3).setValue(whats);
    sheet.getRange(i + 1, 4).setValue(email);
    if (d.cpf !== undefined) sheet.getRange(i + 1, 24).setValue(normalizarCPF(String(d.cpf)));
    if (d.anotacao !== undefined) sheet.getRange(i + 1, 23).setValue(String(d.anotacao).trim());
    var pessoaId = String(rows[i][19] || '');
    if (pessoaId) {
      var pesSheet = getSheet('Pessoas');
      var pesRows = pesSheet.getDataRange().getValues();
      for (var j = 1; j < pesRows.length; j++) {
        if (String(pesRows[j][0]) === pessoaId) {
          pesSheet.getRange(j + 1, 3).setValue(nome);
          pesSheet.getRange(j + 1, 4).setValue(whats);
          pesSheet.getRange(j + 1, 5).setValue(email);
          if (d.cpf !== undefined) pesSheet.getRange(j + 1, 13).setValue(normalizarCPF(String(d.cpf)));
          if (d.anotacao !== undefined) pesSheet.getRange(j + 1, 12).setValue(String(d.anotacao).trim());
          break;
        }
      }
    }
    return { ok: true };
  }
  return { ok: false, erro: 'Inscrição não encontrada.' };
}

function marcarConcluido(id) {
  var sheet = getSheet('Inscritos');
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(id)) continue;
    var atual = String(rows[i][15] || '').toLowerCase() === 'sim' ? 'não' : 'sim';
    sheet.getRange(i + 1, 16).setValue(atual);
    return { ok: true, concluido: atual };
  }
  return { ok: false, erro: 'Inscrição não encontrada.' };
}

function reenviarConviteGrupo(id) {
  var sheet = getSheet('Inscritos');
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(id)) continue;
    if (String(rows[i][9] || '').trim() !== 'pago') return { ok: false, erro: 'A inscrição ainda não está paga.' };
    sheet.getRange(i + 1, 11).setValue('não');
    enviaConviteSePossivel(i + 1);
    return { ok: true };
  }
  return { ok: false, erro: 'Inscrição não encontrada.' };
}

function garantirCodigoConvite(tab, row) {
  var sheet = getSheet(tab);
  var col = tab === 'Pessoas' ? 10 : 21;
  var atual = String(sheet.getRange(row + 1, col).getValue() || '').trim();
  if (atual) return atual;
  var novo = gerarCodigoConvite();
  sheet.getRange(row + 1, col).setValue(novo);
  return novo;
}

/* ---------------------------------------------------------
   REENVIO DE ACESSO — Área do Estudante (aluno.html)
   O aluno digita e-mail ou WhatsApp cadastrado e recebe
   novamente o link mágico por e-mail.
   --------------------------------------------------------- */
function reenviarAcessoPorContato(contato) {
  var c = String(contato || '').trim();
  if (!c) return { ok: false, erro: 'Digite seu e-mail ou WhatsApp.' };

  var emailBusca = c.toLowerCase();
  var whatsBusca = c.replace(/\D/g, '');
  var whatsCurto = whatsBusca.replace(/^55/, '');

  var sheet = getSheet('Inscritos');
  var rows = sheet.getDataRange().getValues();

  for (var i = 1; i < rows.length; i++) {
    var email = String(rows[i][3] || '').trim();
    var whats = String(rows[i][2] || '').trim();
    var whatsNorm = whats.replace(/\D/g, '').replace(/^55/, '');

    var bateEmail = email.toLowerCase() === emailBusca;
    var bateWhats = whatsNorm.length >= 8 && (whatsNorm === whatsCurto || whatsNorm === whatsBusca);

    if (!bateEmail && !bateWhats) continue;

    var status = String(rows[i][9] || '').trim();
    if (status !== 'pago') {
      return { ok: false, erro: 'Encontramos sua inscrição, mas ela ainda não está confirmada. Assim que o pagamento for aprovado, o acesso chega no seu e-mail.' };
    }

    regenerarAcessoInscricao(i, rows);
    return { ok: true, msg: 'Enviamos o acesso para o seu e-mail. Confira também a caixa de spam.' };
  }

  try {
    enviarAvisoCadastroNaoEncontrado(c);
  } catch (err) {
    Logger.log('Aviso de cadastro não encontrado: ' + err);
  }

  return {
    ok: false,
    naoEncontrado: true,
    erro: 'Não encontramos inscrição com esse e-mail ou WhatsApp. Se você ainda não garantiu sua vaga, pode se inscrever pelo site ou chamar a gente no WhatsApp (34) 93618-6847. Se já pagou, fica tranquilo: a gente recebeu o aviso e vai te procurar.'
  };
}

function enviarAvisoCadastroNaoEncontrado(contato) {
  var destino = getNotificarEmail();
  var agora = formatDate(new Date());
  var corpo = '<div style="font-family:Segoe UI,Arial,sans-serif;color:#212121;max-width:560px;margin:0 auto">' +
    '<h2 style="color:#4A2E1B">Alguém tentou acessar a Área do Estudante</h2>' +
    '<p>Recebemos uma tentativa de acesso com <strong>' + esc(contato) + '</strong> (' + agora + '), mas não encontramos inscrição cadastrada.</p>' +
    '<p>Pode ser:</p><ul>' +
    '<li>pagamento ainda não confirmado;</li>' +
    '<li>e-mail ou WhatsApp digitado diferente do cadastro;</li>' +
    '<li>ou uma pessoa que ainda não se inscreveu.</li></ul>' +
    '<p>Vale conferir na planilha de Inscritos e, se for o caso, responder essa pessoa pelo WhatsApp.</p>' +
    '<p style="color:#8A7A5C;font-size:.85rem">Pão de Verdade — Forneria Artesanal</p></div>';
  GmailApp.sendEmail(destino, 'Tentativa de acesso à Área do Estudante — verificar',
    'Tentativa de acesso com: ' + contato + ' (' + agora + '). Não encontramos inscrição. Confira a planilha de Inscritos.',
    { htmlBody: corpo });
}

function buscarAreaAluno(token) {
  return jsonOut(buscarAlunoComErro(token));
}

function buscarAlunoComErro(token) {
  try {
    return buscarAlunoDados(token);
  } catch (err) {
    Logger.log('Área do Aluno: ' + err);
    return { ok: false, erro: 'Não foi possível consultar sua inscrição. Atualize as abas da planilha e tente novamente.' };
  }
}

function adminToken(curso) {
  var sel = curso === 'pizza' ? ':pizza' : curso === 'pao' ? ':pao' : '';
  return hashToken('admin:' + getPainelSenha() + sel);
}

function turmaAdmin(curso) {
  var sheet = getSheet('Turmas');
  var rows = sheet.getDataRange().getValues();
  var alvo = normalizarCurso(curso);
  var hoje = new Date();
  hoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  var melhor = '';
  var melhorTs = 0;
  for (var i = 1; i < rows.length; i++) {
    if (normalizarCurso(rows[i][0]) !== alvo) continue;
    var dt = normalizarData(rows[i][1]);
    if (!dt) continue;
    var p = dt.split('/');
    var ts = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])).getTime();
    if (ts < hoje) continue;
    if (!melhorTs || ts < melhorTs) { melhor = dt; melhorTs = ts; }
  }
  if (!melhor) {
    for (var j = 1; j < rows.length; j++) {
      if (normalizarCurso(rows[j][0]) !== alvo) continue;
      var d2 = normalizarData(rows[j][1]);
      if (d2) return d2;
    }
  }
  return melhor;
}

function areaAlunoAdmin(curso) {
  var chaves = curso === 'pizza' ? ['Pizza'] : curso === 'pao' ? ['Pão'] : ['Pão', 'Pizza'];
  var cursos = [];
  chaves.forEach(function (nome) {
    var dt = turmaAdmin(nome);
    var turma = { linkGrupo: '', apostilaURL: '', aviso: '' };
    try { turma = buscarDetalhesTurma(nome, dt); } catch (err) { Logger.log(err); }
    cursos.push({
      curso: nome,
      dataTurma: dt,
      pedido: '',
      pago: true,
      grupo: turma.linkGrupo,
      aviso: turma.aviso,
      apostila: turma.apostilaURL || '',
      certificado: '',
      concluido: false
    });
  });
  return { ok: true, aluno: { nome: 'Administrador', cursos: cursos, codigoConvite: '', credito: 0 } };
}

function buscarAlunoDados(token) {
  var cursoAdmin = token === adminToken('pao') ? 'pao' : token === adminToken('pizza') ? 'pizza' : token === adminToken() ? 'ambos' : '';
  if (cursoAdmin) return areaAlunoAdmin(cursoAdmin);
  if (!token || token.length < 20) return { ok: false, erro: 'Link inválido.' };
  var hash = hashToken(token);
  var iSheet = getSheet('Inscritos');
  var iRows = iSheet.getDataRange().getValues();

  try {
    var pesSheet = getSheet('Pessoas');
    var pesRows = pesSheet.getDataRange().getValues();
    for (var p = 1; p < pesRows.length; p++) {
      if (String(pesRows[p][5] || '') !== hash) continue;
      var pessoaId = String(pesRows[p][0]);
      var nome = String(pesRows[p][2] || '').trim();
      var cursos = [];
      var pedidosIds = [];
      for (var k = 1; k < iRows.length; k++) {
        if (String(iRows[k][19]) !== pessoaId) continue;
        var pid = String(iRows[k][18] || '');
        if (pid && pedidosIds.indexOf(pid) === -1) pedidosIds.push(pid);
        if (String(iRows[k][9] || '').trim() === 'cancelado') continue;
        var turma = { linkGrupo: '', apostilaURL: '', aviso: '' };
        try { turma = buscarDetalhesTurma(iRows[k][4], iRows[k][5]); } catch (err) { Logger.log(err); }
        cursos.push({
          curso: iRows[k][4],
          dataTurma: normalizarData(iRows[k][5]),
          pedido: pid,
          pago: String(iRows[k][9] || '').trim() === 'pago',
          grupo: turma.linkGrupo,
          aviso: turma.aviso,
          apostila: iRows[k][13] || turma.apostilaURL || '',
          certificado: iRows[k][14] || '',
          concluido: String(iRows[k][15] || '').toLowerCase() === 'sim'
        });
      }
      if (cursos.length || pedidosIds.length) {
        var credObj = buscarCreditoAtivo(pedidosIds);
        return { ok: true, aluno: {
          nome: nome, cursos: cursos,
          codigoConvite: garantirCodigoConvite('Pessoas', p),
          credito: Number(pesRows[p][10] || 0),
          creditoCodigo: credObj ? credObj.codigo : '',
          creditoValor: credObj ? credObj.valor : 0
        } };
      }
    }
  } catch (err) { Logger.log('Pessoas: ' + err); }

  for (var i = 1; i < iRows.length; i++) {
    if (String(iRows[i][12] || '') !== hash) continue;
    var nome2 = String(iRows[i][1] || '').trim();
    var pedido2 = String(iRows[i][18] || '');
    var credObj2 = buscarCreditoAtivo(pedido2 ? [pedido2] : []);
    if (String(iRows[i][9] || '').trim() === 'cancelado') {
      return { ok: true, aluno: {
        nome: nome2, cursos: [],
        codigoConvite: garantirCodigoConvite('Inscritos', i),
        credito: Number(iRows[i][21] || 0),
        creditoCodigo: credObj2 ? credObj2.codigo : '',
        creditoValor: credObj2 ? credObj2.valor : 0
      } };
    }
    var turma = { linkGrupo: '', apostilaURL: '', aviso: '' };
    try { turma = buscarDetalhesTurma(iRows[i][4], iRows[i][5]); } catch (err) { Logger.log(err); }
    return { ok: true, aluno: {
      nome: nome2, curso: iRows[i][4], dataTurma: normalizarData(iRows[i][5]),
      pedido: pedido2,
      pago: String(iRows[i][9] || '').trim() === 'pago',
      grupo: turma.linkGrupo,
      aviso: turma.aviso,
      apostila: iRows[i][13] || turma.apostilaURL || '', certificado: iRows[i][14] || '',
      concluido: String(iRows[i][15] || '').toLowerCase() === 'sim',
      codigoConvite: garantirCodigoConvite('Inscritos', i),
      credito: Number(iRows[i][21] || 0),
      creditoCodigo: credObj2 ? credObj2.codigo : '',
      creditoValor: credObj2 ? credObj2.valor : 0
    }};
  }
  return { ok: false, erro: 'Link inválido ou expirado.' };
}

function buscarCreditoAtivo(pedidosIds) {
  if (!pedidosIds || !pedidosIds.length) return null;
  try {
    var sheet = getSheet('Cupons');
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][3] || '').trim().toLowerCase() !== 'ativo') continue;
      var pid = String(rows[i][6] || '').trim();
      if (!pid || pedidosIds.indexOf(pid) === -1) continue;
      return { codigo: String(rows[i][0] || ''), valor: Number(rows[i][2] || 0) };
    }
  } catch (err) {}
  return null;
}

function buscarDetalhesTurma(curso, dataTurma) {
  var sheet = getSheet('Turmas');
  var numCols = sheet.getLastColumn();
  var rows = sheet.getDataRange().getValues();
  var alvoCurso = normalizarCurso(curso);
  var alvoData = normalizarData(dataTurma);
  for (var i = 1; i < rows.length; i++) {
    var tCurso = normalizarCurso(rows[i][0]);
    var tData = normalizarData(rows[i][1]);
    if (tCurso === alvoCurso && tData === alvoData) {
      var linkGrupo = numCols >= 3 ? String(rows[i][2] || '') : '';
      var apostila = numCols >= 4 ? String(rows[i][3] || '') : '';
      var aviso = numCols >= 5 ? String(rows[i][4] || '') : '';
      return { linkGrupo: linkGrupo, apostilaURL: apostila, aviso: aviso };
    }
  }
  return { linkGrupo: '', apostilaURL: '', aviso: '' };
}

function hashToken(token) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8);
  return digest.map(function (b) { var n = b < 0 ? b + 256 : b; return ('0' + n.toString(16)).slice(-2); }).join('');
}

function consultarPagamento(paymentId) {
  var token = getMPToken();
  var res = UrlFetchApp.fetch(MP_API + '/v1/payments/' + paymentId, {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 400) return null;
  return JSON.parse(res.getContentText());
}

/* ---------------------------------------------------------
   ENVIO AUTOMÁTICO DO LINK DO GRUPO
   ---------------------------------------------------------
   Roda pela planilha (menu: "Enviar convites de grupos").
   Para cada turma com link de grupo preenchido, envia o
   convite por e-mail aos alunos pagos que ainda não receberam.
   --------------------------------------------------------- */
function enviarConvites() {
  var turmas = getSheet('Turmas').getDataRange().getValues();
  var envios = 0;

  for (var t = 1; t < turmas.length; t++) {
    var curso = String(turmas[t][0] || '').trim();
    var dataTurma = String(turmas[t][1] || '').trim();
    var link = String(turmas[t][2] || '').trim();
    if (!curso || !dataTurma || !link) continue;

    var alunos = getSheet('Inscritos').getDataRange().getValues();
    for (var i = 1; i < alunos.length; i++) {
      var aCurso = String(alunos[i][4] || '').trim();
      var aData = String(alunos[i][5] || '').trim();
      var status = String(alunos[i][9] || '').trim();
      var jaEnviou = String(alunos[i][10] || '').trim().toLowerCase();
      var email = String(alunos[i][3] || '').trim();
      var nome = String(alunos[i][1] || '').trim();

      if (aCurso === curso && aData === dataTurma && status === 'pago' &&
          jaEnviou === 'não' && email) {
        enviarEmailConvite(email, nome, curso, dataTurma, link);
        SpreadsheetApp.getActiveSheet ? null : null;
        getSheet('Inscritos').getRange(i + 1, 11).setValue('sim');
        envios++;
      }
    }
  }
  SpreadsheetApp.getUi().alert('Convites enviados: ' + envios);
}

function enviaConviteSePossivel(row) {
  var sheet = getSheet('Inscritos');
  var r = sheet.getRange(row, 1, 1, 11).getValues()[0];
  var curso = String(r[4] || '').trim();
  var dataTurma = String(r[5] || '').trim();
  var email = String(r[3] || '').trim();
  var nome = String(r[1] || '').trim();

  var turmas = getSheet('Turmas').getDataRange().getValues();
  for (var t = 1; t < turmas.length; t++) {
    if (String(turmas[t][0] || '').trim() === curso &&
        String(turmas[t][1] || '').trim() === dataTurma &&
        String(turmas[t][2] || '').trim()) {
      enviarEmailConvite(email, nome, curso, dataTurma, String(turmas[t][2]).trim());
      sheet.getRange(row, 11).setValue('sim');
      return;
    }
  }
}

function enviarEmailConvite(email, nome, curso, dataTurma, link) {
  var dataAmigavel = formatarDataAmigavel(dataTurma);
  var assunto = 'Seu convite para o grupo da oficina de ' + curso +
    (dataAmigavel ? ' (' + dataAmigavel + ')' : '');
  var corpo =
    '<div style="font-family:Segoe UI,Arial,sans-serif;color:#212121;max-width:560px;margin:0 auto">' +
    '<h2 style="color:#4A2E1B">Oi, ' + esc(nome) + '!</h2>' +
    '<p>Sua vaga na oficina de <strong>' + esc(curso) + '</strong>' +
    (dataAmigavel ? ' do dia <strong>' + esc(dataAmigavel) + '</strong>' : '') +
    ' está confirmada. Que alegria!</p>' +
    '<p>Entra no grupo da turma pra gente se organizar:</p>' +
    '<p><a href="' + esc(link) + '" style="display:inline-block;background:#212121;color:#fff;' +
    'padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700">' +
    'Entrar no grupo da turma</a></p>' +
    '<p>Qualquer dúvida, é só chamar no WhatsApp: <strong>(34) 93618-6847</strong>.</p>' +
    '<p>Esperamos você com o forno ligado! 🍞</p>' +
    '<p style="color:#8A7A5C;font-size:.85rem">Pão de Verdade — Forneria Artesanal</p>' +
    '</div>';
  GmailApp.sendEmail(email, assunto, 'Sua vaga na oficina de ' + curso +
    (dataAmigavel ? ' do dia ' + dataAmigavel : '') +
    ' está confirmada. Entre no grupo da turma: ' + link, {
    htmlBody: corpo
  });
}

/* ---------------------------------------------------------
   API do painel (chamadas via google.script.run)
   --------------------------------------------------------- */
function listarInscritos() {
  var sheet = getSheet('Inscritos');
  var rows = sheet.getDataRange().getValues();
  var emailSet = {};
  try {
    var logs = getSheet('Logs').getDataRange().getValues();
    for (var l = 1; l < logs.length; l++) {
      if (String(logs[l][1] || '') === 'certificado_email') emailSet[String(logs[l][2] || '')] = true;
    }
  } catch (e) {}
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var pedidoId = String(rows[i][18] || '');
    var pessoaId = String(rows[i][19] || '');
    out.push({
      id: rows[i][0], nome: rows[i][1], whatsapp: rows[i][2], email: rows[i][3],
      curso: rows[i][4], dataTurma: normalizarData(rows[i][5]), valor: rows[i][6],
      pref: rows[i][7], payment: rows[i][8], status: rows[i][9],
      linkEnviado: rows[i][10], registro: formatarRegistro(rows[i][11]),
      concluido: rows[i][15],
      certificado: rows[i][14],
      emailCertEnviado: emailSet[String(rows[i][0])] ? true : false,
      pedidoId: pedidoId.indexOf('PED') === 0 ? pedidoId : '',
      pessoaId: pessoaId.indexOf('PS') === 0 ? pessoaId : '',
      codigoConvite: rows[i][20], credito: rows[i][21], anotacao: rows[i][22], cpf: formatarCPF(rows[i][23] || '')
    });
  }
  return out;
}

function formatarRegistro(v) {
  if (!v) return '';
  var d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return formatDate(d);
}

function listarTurmas() {
  return listarTurmasComVagas(false);
}

function filtrarTurmasAtivas(lista) {
  var ativas = turmasAtivas();
  if (!ativas.length) return [];
  return (Array.isArray(lista) ? lista : []).filter(function (t) {
    return turmaAtiva(t.curso, t.dataTurma);
  });
}

/* --- PRÓXIMAS TURMAS (público) ----
   Fonte única do front para "próxima turma": devolve as turmas futuras da
   planilha (dataTurma >= hoje) com ocupação e a flag 'ativa' (se está à
   venda segundo TURMA_ATIVA). Ordenadas por data. Quando nada estiver
   agendado, devolve []. */
function proximasTurmas() {
  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  var out = [];
  var lista = listarTurmasComVagas(true);
  for (var i = 0; i < lista.length; i++) {
    var t = lista[i];
    var d = parseDataRegistro(t.dataTurma);
    if (!d || d.getTime() < hoje.getTime()) continue;
    out.push({
      curso: t.curso,
      dataTurma: t.dataTurma,
      vagas: t.vagas,
      ocupadas: t.ocupadas,
      restantes: t.restantes,
      cheia: t.cheia,
      ativa: turmaAtiva(t.curso, t.dataTurma)
    });
  }
  out.sort(function (a, b) {
    var da = parseDataRegistro(a.dataTurma);
    var db = parseDataRegistro(b.dataTurma);
    var dif = (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
    if (dif !== 0) return dif;
    var ordem = { 'Pão': 0, 'Pizza': 1 };
    return (ordem[normalizarCurso(a.curso)] || 9) - (ordem[normalizarCurso(b.curso)] || 9);
  });
  return out;
}

function listarTurmasComVagas(usarCache) {
  var cache = CacheService.getScriptCache();
  if (usarCache) {
    var c = cache.get('turmas_vagas');
    if (c) { try { return JSON.parse(c); } catch (eC) {} }
  }
  var sheet = getSheet('Turmas');
  var numCols = sheet.getLastColumn();
  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var curso = String(rows[i][0] || '').trim();
    var dataTurma = normalizarData(rows[i][1]);
    if (!curso || !dataTurma) continue;
    var linkGrupo = numCols >= 3 ? String(rows[i][2] || '') : '';
    var vagas = numCols >= 6 ? parseInt(String(rows[i][5]).replace(/\D/g, ''), 10) : 0;
    if (!vagas || isNaN(vagas)) vagas = 10;
    var oc = contarOcupadas(curso, dataTurma);
    out.push({ curso: curso, dataTurma: dataTurma, linkGrupo: linkGrupo, vagas: vagas, ocupadas: oc.ocupadas, restantes: oc.restantes, reservadas: oc.reservadas, cheia: oc.restantes <= 0 });
  }
  try { cache.put('turmas_vagas', JSON.stringify(out), 300); } catch (eC) {}
  return out;
}

function contarOcupadas(curso, dataTurma) {
  var vagas = getVagasTurma(curso, dataTurma);
  var iSheet = getSheet('Inscritos');
  var rows = iSheet.getDataRange().getValues();
  var pedidosPag = mapaPedidosComPagamento();
  var alvoCurso = normalizarCurso(curso);
  var alvoData = normalizarData(dataTurma);
  var corte = new Date(new Date().getTime() - 30 * 60 * 1000);
  var ocupadas = 0;
  for (var i = 1; i < rows.length; i++) {
    if (normalizarCurso(rows[i][4]) !== alvoCurso) continue;
    if (normalizarData(rows[i][5]) !== alvoData) continue;
    var st = String(rows[i][9] || '').trim();
    if (st === 'pago') { ocupadas++; continue; }
    if (st === 'aguardando') {
      var reg = parseDataRegistro(rows[i][11]);
      if (reg && reg.getTime() >= corte.getTime() && temPagamentoIntencao(rows[i], pedidosPag)) ocupadas++;
    }
  }
  var reservadas = reservasAtivas(curso, dataTurma);
  var restantes = Math.max(0, vagas - ocupadas - reservadas);
  return { vagas: vagas, ocupadas: ocupadas, reservadas: reservadas, restantes: restantes };
}

/* --- Vaga 'aguardando' só conta se o Mercado Pago devolveu um id ---
   (preferência em H/I do Inscritos, ou pagamento em H/I do Pedidos).
   Inscrito sem pagamento criado não segura vaga: fecha o ataque de
   segurar a turma inteira sem pagar (criarpedido em loop). */
function temPagamentoIntencao(inscrito, pedidosPag) {
  if (String(inscrito[7] || '').trim() || String(inscrito[8] || '').trim()) return true;
  var pedidoId = String(inscrito[18] || '').trim();
  if (!pedidoId) return false;
  return !!pedidosPag[pedidoId];
}
function mapaPedidosComPagamento() {
  var out = {};
  try {
    var rows = getSheet('Pedidos').getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0] || '').indexOf('PED') !== 0) continue;
      if (String(rows[i][7] || '').trim() || String(rows[i][8] || '').trim()) out[String(rows[i][0])] = true;
    }
  } catch (e) {}
  return out;
}

function getVagasTurma(curso, dataTurma) {
  var sheet = getSheet('Turmas');
  var numCols = sheet.getLastColumn();
  var rows = sheet.getDataRange().getValues();
  var alvoCurso = normalizarCurso(curso);
  var alvoData = normalizarData(dataTurma);
  for (var i = 1; i < rows.length; i++) {
    if (normalizarCurso(rows[i][0]) !== alvoCurso) continue;
    if (normalizarData(rows[i][1]) !== alvoData) continue;
    var v = numCols >= 6 ? parseInt(String(rows[i][5]).replace(/\D/g, ''), 10) : 0;
    if (!v || isNaN(v)) v = 10;
    return v;
  }
  return 10;
}

function parseDataRegistro(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  var s = String(v).trim();
  var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T]?(\d{2}):(\d{2})/);
  if (m) return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10), parseInt(m[4], 10), parseInt(m[5], 10));
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function turmaAberta(curso, dataTurma) {
  var sheet = getSheet('Turmas');
  var rows = sheet.getDataRange().getValues();
  var alvoCurso = normalizarCurso(curso);
  var alvoData = normalizarData(dataTurma);
  for (var i = 1; i < rows.length; i++) {
    if (normalizarCurso(rows[i][0]) !== alvoCurso) continue;
    if (normalizarData(rows[i][1]) !== alvoData) continue;
    return true;
  }
  return false;
}

function checarVagas(itens, dataTurma, codigo) {
  var reserva = codigo ? buscarReserva(codigo) : null;
  var porCurso = {};
  itens.forEach(function (it) { porCurso[it.curso] = (porCurso[it.curso] || 0) + 1; });
  var cursos = Object.keys(porCurso);
  for (var i = 0; i < cursos.length; i++) {
    if (!turmaAberta(cursos[i], dataTurma)) {
      return { erro: 'Turma não está aberta — ' + cursos[i] + ' ' + dataTurma + '. Entre na lista de espera.', restantes: 0, curso: cursos[i], turma_nao_aberta: true };
    }
    var oc = contarOcupadas(cursos[i], dataTurma);
    var disp = oc.restantes;
    if (reserva && normalizarCurso(reserva.curso) === normalizarCurso(cursos[i]) && normalizarData(reserva.dataTurma) === normalizarData(dataTurma)) {
      disp += reserva.vagas;
    }
    if (porCurso[cursos[i]] > disp) {
      var msg = 'Turma cheia — ' + cursos[i] + ' ' + dataTurma + '. ';
      if (disp === 0) {
        msg += 'Entre na lista de espera.';
      } else {
        msg += 'Restam apenas ' + disp + ' vaga(s) e sua compra inclui ' + porCurso[cursos[i]] + ' — a dupla não cabe. Dá pra garantir 1 pessoa, escolher outra data com mais vagas ou entrar na lista de espera.';
      }
      return { erro: msg, restantes: disp, curso: cursos[i] };
    }
  }
  return {};
}

function entrarNaLista(d) {
  var nome = String(d.nome || '').trim();
  var whats = String(d.whatsapp || d.whats || '').replace(/\D/g, '');
  var email = String(d.email || '').trim().toLowerCase();
  if (!nome) return { ok: false, erro: 'Informe seu nome.' };
  if (whats.length < 10 && !email) return { ok: false, erro: 'Informe WhatsApp ou e-mail.' };
  var cursos = [];
  String(d.cursos || d.curso || '').split(',').forEach(function (c) {
    var n = normalizarCurso(c);
    if (n && cursos.indexOf(n) === -1) cursos.push(n);
  });
  if (!cursos.length) return { ok: false, erro: 'Escolha um curso (Pão, Pizza ou ambos).' };
  var sheet = getSheet('ListaEspera');
  var rows = sheet.getDataRange().getValues();
  var inseridos = [];
  var duplicados = [];
  cursos.forEach(function (curso) {
    var jaExiste = false;
    for (var i = 1; i < rows.length; i++) {
      if (normalizarCurso(rows[i][0]) !== curso) continue;
      var w = String(rows[i][3] || '').replace(/\D/g, '');
      var e2 = String(rows[i][4] || '').trim().toLowerCase();
      if (w && w === whats) { jaExiste = true; break; }
      if (e2 && email && e2 === email) { jaExiste = true; break; }
    }
    if (jaExiste) { duplicados.push(curso); return; }
    sheet.appendRow([curso, '', nome, whats, email, formatDate(new Date()), 'não']);
    inseridos.push(curso);
  });
  return { ok: true, inseridos: inseridos, duplicados: duplicados, cursos: cursos };
}

function listarListaEspera() {
  var sheet = getSheet('ListaEspera');
  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    if (!String(rows[i][0] || '').trim()) continue;
    out.push({ linha: i + 1, curso: rows[i][0], nome: rows[i][2], whatsapp: rows[i][3], email: rows[i][4], criadoEm: formatarRegistro(rows[i][5]), notificado: rows[i][6] });
  }
  return out;
}

function excluirEspera(id) {
  var sheet = getSheet('ListaEspera');
  var linha = parseInt(String(id), 10);
  if (!linha || isNaN(linha) || linha < 2) return { ok: false, erro: 'Registro inválido.' };
  var lastRow = sheet.getLastRow();
  if (linha > lastRow) return { ok: false, erro: 'Registro não encontrado.' };
  sheet.deleteRow(linha);
  return { ok: true };
}

function setarVagas(d) {
  var curso = normalizarCurso(d.curso || '');
  var data = normalizarData(d.dataTurma || d.data || '');
  var vagas = parseInt(String(d.vagas || '').replace(/\D/g, ''), 10);
  if (!curso || !data) return { ok: false, erro: 'Turma inválida.' };
  if (!vagas || isNaN(vagas) || vagas < 1 || vagas > 100) return { ok: false, erro: 'Número de vagas inválido (1–100).' };
  var sheet = getSheet('Turmas');
  var numCols = sheet.getLastColumn();
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (normalizarCurso(rows[i][0]) !== curso) continue;
    if (normalizarData(rows[i][1]) !== data) continue;
    if (numCols < 6) sheet.getRange(1, 6).setValue('Vagas').setFontWeight('bold').setBackground('#F2F0EC');
    sheet.getRange(i + 1, 6).setValue(vagas);
    return { ok: true, vagas: vagas };
  }
  sheet.appendRow([curso, data, '', '', '', vagas]);
  return { ok: true, vagas: vagas };
}

function listarPedidos() {
  var pSheet = getSheet('Pedidos');
  var pesSheet = getSheet('Pessoas');
  var pRows = pSheet.getDataRange().getValues();
  var pesRows = pesSheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < pRows.length; i++) {
    var pessoas = [];
    pesRows.forEach(function (pr) {
      if (pr.length >= 2 && String(pr[1]) === String(pRows[i][0])) {
        pessoas.push({ id: pr[0], nome: pr[2], whats: pr[3], email: pr[4], cursos: pr[7], codigoConvite: pr[9], credito: pr[10], anotacao: pr[11], cpf: formatarCPF(pr[12] || '') });
      }
    });
    out.push({
      pedido: pRows[i][0], status: pRows[i][1], bruto: pRows[i][2], desconto: pRows[i][3],
      total: pRows[i][4], forma: pRows[i][5], registro: formatarRegistro(pRows[i][6]),
      codigoUsado: pRows[i][9], anotacao: pRows[i][10], pessoas: pessoas
    });
  }
  return out;
}

function listarPainelDados() {
  return {
    inscritos: listarInscritos(), turmas: listarTurmas(), pedidos: listarPedidos(),
    cupons: listarCupons(), listaEspera: listarListaEspera(),
    lembretes: listarLembretes(), config: flagsPublicas(),
    metodo: lerMetodo(), receitas: listarReceitas()
  };
}

function getTtsKey() {
  return String(PROPS.getProperty('GOOGLE_TTS_KEY') || '').trim();
}
function getTtsVoice() {
  return String(PROPS.getProperty('TTS_VOICE') || 'pt-BR-Chirp3-HD-Orus').trim();
}
function getTtsPitch() {
  var v = parseInt(PROPS.getProperty('TTS_PITCH') || '', 10);
  return isNaN(v) ? -2 : v;
}
function getTtsRate() {
  var v = parseFloat(PROPS.getProperty('TTS_RATE') || '');
  return isNaN(v) || v <= 0 ? 1.0 : v;
}
function ttsSintetizar(d) {
  var texto = String(d.texto || '').trim().slice(0, 220);
  var key = getTtsKey();
  if (!key) return { ok: false, erro: 'TTS não configurado (GOOGLE_TTS_KEY).' };
  if (!texto) return { ok: false, erro: 'Texto vazio.' };
  var cache = CacheService.getScriptCache();
  var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8)
    .map(function (b) { var n = b < 0 ? b + 256 : b; return ('0' + n.toString(16)).slice(-2); }).join('');
  var ckey = 'tts:' + hash.slice(0, 32);
  try {
    var c = cache.get(ckey);
    if (c) return { ok: true, audio: c };
  } catch (eC) {}
  var voz = getTtsVoice();
  var pitch = /Chirp3/i.test(voz) ? 0 : getTtsPitch();
  var payload = {
    input: { text: texto },
    voice: { languageCode: 'pt-BR', name: voz },
    audioConfig: { audioEncoding: 'MP3', speakingRate: getTtsRate(), pitch: pitch }
  };
  var res;
  try {
    res = UrlFetchApp.fetch('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + encodeURIComponent(key), {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) {
    Logger.log('TTS: ' + err);
    return { ok: false, erro: 'Falha de conexão com o TTS.' };
  }
  if (res.getResponseCode() >= 400) {
    Logger.log('TTS: ' + res.getContentText());
    return { ok: false, erro: 'Falha no TTS (' + res.getResponseCode() + ').' };
  }
  var data = JSON.parse(res.getContentText());
  if (!data.audioContent) return { ok: false, erro: 'Sem áudio na resposta do TTS.' };
  try { cache.put(ckey, data.audioContent, 21600); } catch (eC) {}
  return { ok: true, audio: data.audioContent };
}

/* ---------------------------------------------------------
   MÉTODO & RECEITAS (oficina)
   Método (tempos) compartilhado entre cursos + receitas por curso.
   Dados vivem nas abas Metodo (Chave|Valor) e Receitas.
   --------------------------------------------------------- */
function chaveCurso(v) {
  var s = String(v || '').trim().toLowerCase()
    .replace(/[àáâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
    .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c');
  return s;
}

function lerMetodo() {
  var sheet = getSheet('Metodo');
  var rows = sheet.getDataRange().getValues();
  var vals = {};
  for (var i = 1; i < rows.length; i++) vals[String(rows[i][0]).trim()] = String(rows[i][1]).trim();
  function n(chave, def) {
    var v = parseInt(vals[chave], 10);
    return isNaN(v) || v < 1 ? def : v;
  }
  return {
    dobraIntervaloMin: n('dobraIntervaloMin', 15),
    totalDobras: n('totalDobras', 6),
    modelarAposUltimaDobraMin: n('modelarAposUltimaDobraMin', 90),
    frioAposModelarMin: n('frioAposModelarMin', 90)
  };
}

function salvarMetodo(d) {
  function validarInt(str, nome) {
    var v = parseInt(String(str || '').trim(), 10);
    if (isNaN(v) || v < 1) throw new Error(nome + ' deve ser um número inteiro maior ou igual a 1.');
    return v;
  }
  var mapa;
  try {
    mapa = {
      dobraIntervaloMin: validarInt(d.dobraIntervaloMin, 'Intervalo das dobras'),
      totalDobras: validarInt(d.totalDobras, 'Total de dobras'),
      modelarAposUltimaDobraMin: validarInt(d.modelarAposUltimaDobraMin, 'Minutos após a última dobra para modelar'),
      frioAposModelarMin: validarInt(d.frioAposModelarMin, 'Minutos após modelar para o frio')
    };
  } catch (err) {
    return { ok: false, erro: String(err.message || err) };
  }
  var sheet = getSheet('Metodo');
  var rows = sheet.getDataRange().getValues();
  var linha = {};
  for (var i = 1; i < rows.length; i++) linha[String(rows[i][0]).trim()] = i + 1;
  Object.keys(mapa).forEach(function (k) {
    if (linha[k]) sheet.getRange(linha[k], 2).setValue(mapa[k]);
    else sheet.appendRow([k, mapa[k]]);
  });
  try { CacheService.getScriptCache().remove('metodo_receitas'); } catch (eC) {}
  return { ok: true };
}

function receitasPadrao() {
  return [
    {
      curso: 'Pão', rende: '1 pão grande',
      ingredientes: '500 g de farinha de trigo\n375 g de água morna (75% de hidratação)\n10 g de sal\n3 g de fermento biológico fresco',
      passoDobra: 'Molhe a mão, puxe uma borda da massa e dobre sobre o centro. Gire a vasilha e repita nos 4 lados.',
      passoModelar: 'Com a bancada enfarinhada, modele o pão sem esmagar o gás da massa.',
      passoFrio: 'Leve a massa modelada à geladeira em vasilha coberta com filme (fermentação a frio).'
    },
    {
      curso: 'Pizza', rende: '6 discos grandes',
      ingredientes: '1 kg de farinha de trigo\n650 ml de água fria (65% de hidratação)\n20 g de sal\n3 g de fermento biológico fresco',
      passoDobra: 'Dobre a massa sobre si mesma nos 4 lados a cada 15 minutos, sem rasgar a superfície.',
      passoModelar: 'Divida em 6 bolas, modele e deixe descansar coberto antes de abrir.',
      passoFrio: 'Leve as bolas modeladas à geladeira cobertas com filme.'
    }
  ];
}

function listarReceitas() {
  var sheet = getSheet('Receitas');
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) {
    receitasPadrao().forEach(function (r) {
      sheet.appendRow([r.curso, r.rende, r.ingredientes, r.passoDobra, r.passoModelar, r.passoFrio, 'sim']);
    });
    rows = sheet.getDataRange().getValues();
  }
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    out.push({
      curso: String(rows[i][0] || '').trim(),
      chave: chaveCurso(rows[i][0]),
      rende: String(rows[i][1] || '').trim(),
      ingredientes: String(rows[i][2] || ''),
      passoDobra: String(rows[i][3] || '').trim(),
      passoModelar: String(rows[i][4] || '').trim(),
      passoFrio: String(rows[i][5] || '').trim(),
      ativo: String(rows[i][6] || 'sim').trim().toLowerCase() === 'sim'
    });
  }
  return out;
}

function lerReceitasPublicas() {
  var out = {};
  listarReceitas().forEach(function (r) {
    if (!r.chave || !r.ativo) return;
    out[r.chave] = {
      curso: r.curso,
      rende: r.rende,
      ingredientes: r.ingredientes.split('\n').map(function (x) { return x.trim(); }).filter(function (x) { return x; }),
      passos: { dobra: r.passoDobra, modelar: r.passoModelar, frio: r.passoFrio }
    };
  });
  return out;
}

function lerMetodoPublico() {
  var cache = CacheService.getScriptCache();
  try {
    var c = cache.get('metodo_receitas');
    if (c) { var parsed = JSON.parse(c); if (parsed) return parsed; }
  } catch (eC) {}
  var out = { ok: true, metodo: lerMetodo(), receitas: lerReceitasPublicas(), tts: !!getTtsKey() };
  try { cache.put('metodo_receitas', JSON.stringify(out), 60); } catch (eC) {}
  return out;
}

function salvarReceita(d) {
  var curso = String(d.curso || '').trim();
  var chave = chaveCurso(curso);
  if (!chave) return { ok: false, erro: 'Informe o curso.' };
  var sheet = getSheet('Receitas');
  var rows = sheet.getDataRange().getValues();
  var alvo = -1;
  for (var i = 1; i < rows.length; i++) {
    if (chaveCurso(rows[i][0]) === chave) { alvo = i + 1; break; }
  }
  var linha = [
    curso,
    String(d.renda || '').trim(),
    String(d.ingredientes || '').trim(),
    String(d.passoDobra || '').trim(),
    String(d.passoModelar || '').trim(),
    String(d.passoFrio || '').trim(),
    String(d.ativo || 'sim').trim().toLowerCase() === 'sim' ? 'sim' : 'não'
  ];
  if (alvo > 0) sheet.getRange(alvo, 1, 1, 7).setValues([linha]);
  else sheet.appendRow(linha);
  try { CacheService.getScriptCache().remove('metodo_receitas'); } catch (eC) {}
  return { ok: true };
}

/* ---------------------------------------------------------
   LOGS + DIAGNÓSTICO + INSIGHTS + BACKUP + TELEGRAM
   --------------------------------------------------------- */
function registrarLog(tipo, pedido, detalhe, extra) {
  try {
    getSheet('Logs').appendRow([formatDate(new Date()), String(tipo || ''), String(pedido || ''), String(detalhe || ''), extra ? JSON.stringify(extra) : '']);
  } catch (eL) { Logger.log('registrarLog: ' + eL); }
}

function listarLogs(n) {
  var sheet = getSheet('Logs');
  var rows = sheet.getDataRange().getValues();
  var out = [];
  var max = Math.min(parseInt(String(n), 10) || 100, 500);
  for (var i = rows.length - 1; i >= 1 && out.length < max; i--) {
    if (!String(rows[i][0] || '').trim()) continue;
    var dt = rows[i][0] instanceof Date ? formatDate(rows[i][0]) : String(rows[i][0]);
    out.push({ data: dt, tipo: String(rows[i][1]), pedido: String(rows[i][2]), detalhe: String(rows[i][3]), extra: rows[i][4] ? String(rows[i][4]) : '' });
  }
  return out;
}

function diagnosticar() {
  var d = listarPainelDados();
  var agora = new Date();
  var corte = agora.getTime() - 24 * 3600 * 1000;
  var vendas24h = 0, receita24h = 0;
  try {
    var iRows = getSheet('Inscritos').getDataRange().getValues();
    for (var i = 1; i < iRows.length; i++) {
      if (String(iRows[i][9] || '').trim() !== 'pago') continue;
      var reg = parseDataRegistro(iRows[i][11]);
      if (reg && reg.getTime() >= corte) { vendas24h++; receita24h += Number(iRows[i][6]) || 0; }
    }
  } catch (eI) {}
  var erros = [];
  try {
    var logs = getSheet('Logs').getDataRange().getValues();
    for (var l = logs.length - 1; l >= 1; l--) {
      var txt = String(logs[l][1] || '') + ' ' + String(logs[l][3] || '');
      if (/erro|falha|recusa/i.test(txt)) {
        var lr = parseDataRegistro(logs[l][0]);
        if (lr && lr.getTime() >= corte) {
          erros.push({ data: String(logs[l][0]), tipo: String(logs[l][1]), pedido: String(logs[l][2]), detalhe: String(logs[l][3]) });
          if (erros.length >= 10) break;
        }
      }
    }
  } catch (eL) {}
  return {
    ts: formatDate(new Date()),
    resumo: {
      pagos: (d.inscritos || []).filter(function (x) { return x.status === 'pago'; }).length,
      aguardando: (d.inscritos || []).filter(function (x) { return x.status === 'aguardando'; }).length,
      vendas24h: vendas24h,
      receita24h: Math.round(receita24h * 100) / 100,
      totalInscritos: (d.inscritos || []).length,
      listaEspera: (d.listaEspera || []).length
    },
    turmas: listarTurmasComVagas(false),
    errosRecentes: erros
  };
}

function insights() {
  var d = listarPainelDados();
  var inscritos = d.inscritos || [];
  var pagos = inscritos.filter(function (i) { return i.status === 'pago'; });
  var porCurso = {}, porTurma = {};
  pagos.forEach(function (i) {
    porCurso[i.curso] = (porCurso[i.curso] || 0) + 1;
    var k = i.curso + ' | ' + i.dataTurma;
    porTurma[k] = (porTurma[k] || 0) + 1;
  });
  var receita = 0, duplas = 0;
  (d.pedidos || []).forEach(function (p) {
    if (p.status !== 'pago') return;
    receita += Number(p.total) || 0;
    if ((p.pessoas || []).length > 1) duplas++;
  });
  var checkouts = 0, pagosLog = 0;
  try {
    var logs = getSheet('Logs').getDataRange().getValues();
    for (var i = 1; i < logs.length; i++) {
      var tipo = String(logs[i][1] || '');
      if (tipo === 'checkout') checkouts++;
      if (tipo === 'pago') pagosLog++;
    }
  } catch (eL) {}
  return {
    resumo: {
      pagos: pagos.length,
      receita: Math.round(receita * 100) / 100,
      duplas: duplas,
      ticketMedio: pagos.length ? Math.round((receita / pagos.length) * 100) / 100 : 0
    },
    porCurso: porCurso,
    porTurma: porTurma,
    funil: { checkoutsIniciados: checkouts, pagosConfirmados: pagosLog }
  };
}

function obterPastaBackup() {
  var it = DriveApp.getFoldersByName('Pão de Verdade Backups');
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder('Pão de Verdade Backups');
}

function fazerBackup() {
  var ss = SpreadsheetApp.openById(getSheetId());
  var pasta = obterPastaBackup();
  var nome = 'pdv-backup-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm');
  var copia = ss.copy(nome);
  var arquivo = DriveApp.getFileById(copia.getId());
  pasta.addFile(arquivo);
  DriveApp.getRootFolder().removeFile(arquivo);
  var arquivos = pasta.getFiles();
  var lista = [];
  while (arquivos.hasNext()) {
    var f = arquivos.next();
    lista.push({ id: f.getId(), data: f.getDateCreated() });
  }
  lista.sort(function (a, b) { return b.data - a.data; });
  for (var i = 30; i < lista.length; i++) {
    try { DriveApp.getFileById(lista[i].id).setTrashed(true); } catch (eB) {}
  }
  registrarLog('backup', '', nome);
  return { ok: true, nome: nome };
}

function criarTriggerBackup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'fazerBackup') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('fazerBackup').timeBased().everyDays(1).atHour(6).create();
  return { ok: true, msg: 'Backup diário às 6h agendado.' };
}

function detalhesPedido(pedidoId) {
  var pSheet = getSheet('Pedidos');
  var pRows = pSheet.getDataRange().getValues();
  var total = 0;
  for (var i = 1; i < pRows.length; i++) {
    if (String(pRows[i][0]) !== String(pedidoId)) continue;
    total = Number(pRows[i][4]) || 0;
    break;
  }
  var iSheet = getSheet('Inscritos');
  var iRows = iSheet.getDataRange().getValues();
  var pessoas = [];
  for (var j = 1; j < iRows.length; j++) {
    if (String(iRows[j][18]) !== String(pedidoId)) continue;
    pessoas.push({ nome: String(iRows[j][1] || ''), curso: String(iRows[j][4] || '') });
  }
  if (!pessoas.length) return null;
  return { total: total, pessoas: pessoas };
}

function notificarVendaTelegram(pedidoId) {
  var token = getTelegramBotToken();
  var chat = getTelegramChatId();
  if (!token || !chat) return;
  var det = detalhesPedido(pedidoId);
  if (!det) return;
  var linha = '💰 Venda confirmada!\nPedido ' + pedidoId + ' · R$ ' + (Number(det.total) || 0).toFixed(2);
  det.pessoas.forEach(function (p) { linha += '\n• ' + p.nome + ' (' + p.curso + ')'; });
  try {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chat, text: linha }),
      muteHttpExceptions: true
    });
  } catch (eT) { Logger.log('Telegram: ' + eT); }
}

function telegramTeste() {
  var token = getTelegramBotToken();
  var chat = getTelegramChatId();
  if (!token || !chat) return { ok: false, erro: 'Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID nas Script Properties.' };
  try {
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chat, text: '🔔 Teste de venda — Pão de Verdade. Se você vê isto, a notificação está no ar!' }),
      muteHttpExceptions: true
    });
    var data = JSON.parse(res.getContentText());
    return data.ok ? { ok: true } : { ok: false, erro: String(data.description || 'erro Telegram') };
  } catch (eT) {
    return { ok: false, erro: String(eT) };
  }
}

function configurarProp(d) {
  var chave = String(d.chave || '').trim();
  var valor = String(d.valor || '');
  if (!chave) return { ok: false, erro: 'Informe a chave.' };
  if (/^(MP_ACCESS_TOKEN|PAINEL_SENHA|SHEET_ID|WEB_APP_URL|NOTIFICAR_EMAIL|TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID|WHATSAPP_BRIDGE_URL|BRIDGE_TOKEN|GOOGLE_TTS_KEY|TTS_VOICE|TTS_PITCH|TTS_RATE|TURMA_ATIVA|FEATURE_LOTADA|FEATURE_CANCELAMENTO|FEATURE_LEMBRETE|FEATURE_CROSSSELL|FEATURE_SUPORTE|FEATURE_METODO|CERT_TEMPLATE_ID|CERT_FOLDER_ID|SITE_URL)$/.test(chave)) {
    PROPS.setProperty(chave, valor);
    return { ok: true, chave: chave };
  }
  return { ok: false, erro: 'Chave não permitida.' };
}

function getFeature(chave) {
  var v = String(PROPS.getProperty(chave) || 'ligado').toLowerCase();
  return v === 'ligado' || v === 'on' || v === 'true' || v === '1';
}

function flagsPublicas() {
  return {
    lotada: getFeature('FEATURE_LOTADA'),
    cancelamento: getFeature('FEATURE_CANCELAMENTO'),
    lembrete: getFeature('FEATURE_LEMBRETE'),
    crosssell: getFeature('FEATURE_CROSSSELL'),
    suporte: getFeature('FEATURE_SUPORTE'),
    metodo: getFeature('FEATURE_METODO')
  };
}

/* ---------------------------------------------------------
   ANALÍTICA LIGHT (sem cookies, sem terceiros)
   Eventos do front: view · time (tempo na página) · scroll ·
   click_pagar · turma_cheia. O backend soma em Analiticas.
   --------------------------------------------------------- */
function registrarAnalitica(d) {
  try {
    getSheet('Analiticas').appendRow([
      formatDate(new Date()),
      String(d.evento || ''),
      String(d.pagina || ''),
      String(d.sessao || ''),
      String(d.valor || '')
    ]);
  } catch (eA) { Logger.log('registrarAnalitica: ' + eA); }
}

function analiticas() {
  var sheet = getSheet('Analiticas');
  var rows = sheet.getDataRange().getValues();
  var byPage = {};
  var agora = new Date();
  var corte24h = agora.getTime() - 24 * 3600 * 1000;
  var ultimas24h = { views: 0, clickPagar: 0, turmaCheia: 0, pillView: 0, pillConv: 0 };
  var clickPagar = 0, turmaCheia = 0, pillView = 0, pillConv = 0;
  for (var i = 1; i < rows.length; i++) {
    var data = parseDataRegistro(rows[i][0]);
    var ev = String(rows[i][1] || '');
    var pag = String(rows[i][2] || '') || '?';
    var ses = String(rows[i][3] || '');
    var val = String(rows[i][4] || '');
    if (ev === 'click_pagar') { clickPagar++; if (data && data.getTime() >= corte24h) ultimas24h.clickPagar++; }
    if (ev === 'turma_cheia') { turmaCheia++; if (data && data.getTime() >= corte24h) ultimas24h.turmaCheia++; }
    if (ev === 'pill_view') { pillView++; if (data && data.getTime() >= corte24h) ultimas24h.pillView++; }
    if (ev === 'pill_conv') { pillConv++; if (data && data.getTime() >= corte24h) ultimas24h.pillConv++; }
    if (!byPage[pag]) byPage[pag] = { views: 0, sessoes: {}, tempos: [], scroll: { 25: 0, 50: 0, 75: 0, 90: 0 } };
    var b = byPage[pag];
    if (ev === 'view') {
      b.views++;
      if (ses) b.sessoes[ses] = 1;
      if (data && data.getTime() >= corte24h) ultimas24h.views++;
    } else if (ev === 'time') {
      var n = parseInt(val, 10);
      if (!isNaN(n)) b.tempos.push(n);
    } else if (ev === 'scroll') {
      var s = parseInt(val, 10);
      if (b.scroll[s] !== undefined) b.scroll[s]++;
    }
  }
  var paginas = [];
  Object.keys(byPage).forEach(function (p) {
    var b = byPage[p];
    var sess = Object.keys(b.sessoes).length;
    var soma = 0;
    b.tempos.forEach(function (t) { soma += t; });
    paginas.push({
      pagina: p,
      views: b.views,
      sessoes: sess,
      tempoMedioSeg: b.tempos.length ? Math.round(soma / b.tempos.length) : 0,
      amostrasTempo: b.tempos.length,
      scroll50: b.scroll[50],
      scroll90: b.scroll[90]
    });
  });
  paginas.sort(function (a, b2) { return b2.views - a.views; });
  var pagos = 0;
  try {
    var logs = getSheet('Logs').getDataRange().getValues();
    for (var k = 1; k < logs.length; k++) if (String(logs[k][1] || '') === 'pago') pagos++;
  } catch (eL) {}
  var ckViews = byPage['checkout'] ? byPage['checkout'].views : 0;
  return {
    geradoEm: formatDate(new Date()),
    ultimas24h: ultimas24h,
    paginas: paginas,
    pill: {
      exposicoes: pillView,
      conversoes: pillConv,
      taxa: pillView ? Math.round(pillConv / pillView * 1000) / 10 : 0,
      ultimas24h: { exposicoes: ultimas24h.pillView, conversoes: ultimas24h.pillConv }
    },
    funil: {
      checkoutViews: ckViews,
      clickPagar: clickPagar,
      turmaCheia: turmaCheia,
      pagosConfirmados: pagos,
      taxaClickPagar: ckViews ? Math.round(clickPagar / ckViews * 1000) / 10 : 0,
      taxaConversao: clickPagar ? Math.round(pagos / clickPagar * 1000) / 10 : 0
    }
  };
}

function responder(obj, callback) {
  if (callback) {
    var cb = String(callback).replace(/[^a-zA-Z0-9_$.]/g, '');
    return ContentService.createTextOutput(cb + '(' + JSON.stringify(obj) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return jsonOut(obj);
}

function normalizarData(v) {
  if (!v) return '';
  var s = String(v).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    var dd = ('0' + d.getDate()).slice(-2);
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    return dd + '/' + mm + '/' + d.getFullYear();
  }
  if (/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.test(s)) {
    var m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    return ('0' + m[1]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + m[3];
  }
  return s;
}

function normalizarCurso(v) {
  if (!v) return '';
  var s = String(v).trim().toLowerCase().replace(/i+/g, 'i');
  if (s.indexOf('pizza') !== -1 || s.indexOf('piza') !== -1) return 'Pizza';
  if (s.indexOf('pão') !== -1 || s.indexOf('pao') !== -1) return 'Pão';
  return String(v).trim();
}

/* --- GATE DE VENDA: uma oficina por vez ----
   TURMA_ATIVA = lista do que está à venda, formato "Curso|dd/mm/aaaa;Curso|dd/mm/aaaa".
   Vazia/ausente = NADA à venda (fail-closed). Front e backend usam isso:
   acao=turmas devolve só ativas; criarPedido recusa o resto. */
function turmasAtivas() {
  var raw = String(PROPS.getProperty('TURMA_ATIVA') || '').trim();
  if (!raw) return [];
  return raw.split(';').map(function (s) {
    var p = s.split('|');
    return { curso: String(p[0] || '').trim(), data: normalizarData(p[1]) };
  }).filter(function (t) { return t.curso && t.data; });
}

function turmaAtiva(curso, data) {
  var ativas = turmasAtivas();
  if (!ativas.length) return false;
  var c = normalizarCurso(curso);
  var d = normalizarData(data);
  for (var i = 0; i < ativas.length; i++) {
    if (normalizarCurso(ativas[i].curso) === c && ativas[i].data === d) return true;
  }
  return false;
}

function hexLen(s, n) {
  return typeof s === 'string' && s.length === n && /^[0-9a-fA-F]+$/.test(s);
}

function manutencao() {
  var report = { turmas: [], inscritos: [], regenerados: 0 };

  var tSheet = getSheet('Turmas');
  var tRows = tSheet.getDataRange().getValues();
  var turmasPorCurso = {};
  for (var i = 1; i < tRows.length; i++) {
    var curso = normalizarCurso(tRows[i][0]);
    var data = normalizarData(tRows[i][1]);
    tSheet.getRange(i + 1, 1).setValue(curso);
    tSheet.getRange(i + 1, 2).setValue(data);
    if (!turmasPorCurso[curso]) turmasPorCurso[curso] = data;
    report.turmas.push(curso + ' | ' + data);
  }

  var iSheet = getSheet('Inscritos');
  var lastRow = iSheet.getLastRow();
  var lastCol = iSheet.getLastColumn();
  var all = iSheet.getRange(1, 1, lastRow, lastCol).getValues();
  var header = ['ID', 'Nome', 'WhatsApp', 'Email', 'Curso', 'DataTurma', 'Valor', 'PrefID', 'PaymentID', 'Status', 'LinkEnviado', 'RegistradoEm', 'AreaTokenHash', 'ApostilaURL', 'CertificadoURL', 'Concluido', 'AcessoEnviado', 'AreaToken'];
  iSheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#F2F0EC');

  for (var j = 1; j < lastRow; j++) {
    var r = all[j];
    var hash = '';
    var raw = '';
    var apostila = '';
    var cert = '';
    var concluido = 'não';
    var acesso = 'não';
    for (var c = 0; c < r.length; c++) {
      var v = r[c];
      if (hexLen(v, 64) && !hash) hash = v;
      else if (hexLen(v, 128) && !raw) raw = v;
    }
    var status = String(r[9] || '').trim();
    var nome = String(r[1] || '').trim();
    var email = String(r[3] || '').trim();
    var curso = normalizarCurso(r[4]);
    var data = normalizarData(r[5]);
    if (status === 'pago' && turmasPorCurso[curso] && (!/^\d{2}\/\d{2}\/\d{4}$/.test(data) || data !== turmasPorCurso[curso])) {
      data = turmasPorCurso[curso];
    }
    if (status === 'pago') {
      if (!raw || !hash) {
        var novo = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
        hash = hashToken(novo);
        raw = novo;
        acesso = 'não';
        report.regenerados++;
        try { enviarAcessoAlunoComDados(nome, email, curso, data, novo); } catch (err) {}
      }
      if (String(r[16] || '').toLowerCase() === 'sim') acesso = 'sim';
    }
    var out = [r[0], nome, r[2], email, curso, data, r[6], r[7], r[8], status, r[10], r[11], hash, apostila, cert, concluido, acesso, raw];
    iSheet.getRange(j + 1, 1, 1, 18).setValues([out]);
    report.inscritos.push(String(r[0]) + ' | ' + status + ' | ' + curso + ' | ' + data + ' | token=' + (raw ? 'sim' : 'nao') + ' | acesso=' + acesso);
  }
  return report;
}

function enviarAcessoAlunoComDados(nome, email, curso, dataTurma, token) {
  if (!email) return;
  var dataAmigavel = formatarDataAmigavel(dataTurma);
  var link = 'https://ferrarijonas.github.io/paodeverdade/aluno.html?token=' + encodeURIComponent(token);
  var corpo = '<div style="font-family:Segoe UI,Arial,sans-serif;color:#212121;max-width:560px;margin:0 auto">' +
    '<h2 style="color:#4A2E1B">Oi, ' + esc(nome) + '!</h2>' +
    '<p>Sua vaga na oficina de <strong>' + esc(curso) + '</strong>' +
    (dataAmigavel ? ' do dia <strong>' + esc(dataAmigavel) + '</strong>' : '') +
    ' está confirmada.</p>' +
    '<p><a href="' + esc(link) + '" style="display:inline-block;background:#212121;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700">Abrir minha Área do Estudante</a></p>' +
    '<p style="color:#8A7A5C;font-size:.85rem">Pão de Verdade — Forneria Artesanal</p></div>';
  GmailApp.sendEmail(email, 'Sua Área do Estudante — Pão de Verdade',
    'Sua vaga na oficina de ' + curso + (dataAmigavel ? ' do dia ' + dataAmigavel : '') +
    ' está confirmada. Acesse sua Área do Estudante: ' + link, { htmlBody: corpo });
}

/* ---------------------------------------------------------
   Utilitários
   --------------------------------------------------------- */
/* Mapa central de abas: getSheet cria automaticamente a aba
   (com headers) se ela ainda não existir na planilha. */
var ABAS = {
  'Inscritos': ['ID', 'Nome', 'WhatsApp', 'Email', 'Curso', 'DataTurma',
    'Valor', 'PrefID', 'PaymentID', 'Status', 'LinkEnviado', 'RegistradoEm',
    'AreaTokenHash', 'ApostilaURL', 'CertificadoURL', 'Concluido', 'AcessoEnviado', 'AreaToken',
    'PedidoID', 'PessoaID', 'CodigoConvite', 'Credito', 'Anotacao', 'CPF'],
  'Turmas': ['Curso', 'DataTurma', 'LinkGrupo', 'ApostilaURL', 'AvisoTurma', 'Vagas'],
  'Pedidos': ['PedidoID', 'Status', 'ValorBruto', 'Desconto', 'ValorTotal', 'FormaPagamento', 'RegistradoEm', 'PrefID', 'PaymentID', 'CodigoUsado', 'Anotacao', 'ClientOrderID'],
  'Pessoas': ['PessoaID', 'PedidoID', 'Nome', 'WhatsApp', 'Email', 'AreaTokenHash', 'AreaToken', 'Cursos', 'AcessoEnviado', 'CodigoConvite', 'Credito', 'Anotacao', 'CPF'],
  'Cupons': ['Codigo', 'Tipo', 'Valor', 'Status', 'CriadoEm', 'UsadoEm', 'PedidoID', 'Anotacao', 'CursoReserva', 'DataReserva', 'VagasReserva'],
  'ListaEspera': ['Curso', 'DataTurma', 'Nome', 'WhatsApp', 'Email', 'CriadoEm', 'Notificado'],
  'Lembretes': ['ID', 'Titulo', 'Tipo', 'Canal', 'Curso', 'DiasAntes', 'Mensagem', 'Ativo', 'CriadoEm', 'UltimoEnvio'],
  'Metodo': ['Chave', 'Valor'],
  'Receitas': ['Curso', 'Rende', 'Ingredientes', 'PassoDobra', 'PassoModelar', 'PassoFrio', 'Ativo'],
  'Logs': ['Data', 'Tipo', 'Pedido', 'Detalhe', 'Extra'],
  'Analiticas': ['Data', 'Evento', 'Pagina', 'Sessao', 'Valor']
};

function getSheet(nome) {
  var id = getSheetId();
  if (!id) throw new Error('SHEET_ID não configurado.');
  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName(nome);
  if (!sh) {
    var headers = ABAS[nome];
    if (!headers) throw new Error('Aba "' + nome + '" não existe e não está no mapa ABAS.');
    sh = ensureSheet(ss, nome, headers);
  }
  return sh;
}

function criarAbas() {
  var id = getSheetId();
  var ss = SpreadsheetApp.openById(id);
  Object.keys(ABAS).forEach(function (nome) {
    ensureSheet(ss, nome, ABAS[nome]);
  });
}

function ensureSheet(ss, nome, headers) {
  var sh = ss.getSheetByName(nome);
  if (!sh) sh = ss.insertSheet(nome);
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#F2F0EC');
  } else {
    var atual = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    headers.forEach(function (header) {
      if (atual.indexOf(header) === -1) {
        sh.getRange(1, sh.getLastColumn() + 1).setValue(header).setFontWeight('bold').setBackground('#F2F0EC');
        atual.push(header);
      }
    });
  }
  return sh;
}

function generateId(sheet) {
  var now = new Date();
  return 'PDV' + now.getTime().toString().slice(-9) +
    String(sheet.getLastRow() + 1);
}

function formatDate(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
}

function formatarDataAmigavel(v) {
  var data = normalizarData(v);
  var partes = data.split('/');
  if (partes.length !== 3) return data;
  var meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var mes = parseInt(partes[1], 10);
  if (!mes || mes > 12) return data;
  return parseInt(partes[0], 10) + ' de ' + meses[mes - 1] + ' de ' + partes[2];
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* --- CERTIFICADO: emissão via planilha + PDF gerado no navegador do aluno ----
   ?acao=gerarcertificado&token=...    (valida e atribui nº de registro, idempotente)
   ?acao=registrarcertificados&senha=  (admin: numera os pagos existentes, uma vez) */

function gerarCertificado(token, cursoParam, dataParam) {
  var iSheet = getSheet('Inscritos');
  var iRows = iSheet.getDataRange().getValues();
  var hash = hashToken(token || '');
  var cursoAlvo = cursoParam ? normalizarCurso(cursoParam) : '';
  var dataAlvo = dataParam ? normalizarData(dataParam) : '';
  var idx = -1;
  for (var i = 1; i < iRows.length; i++) {
    if (String(iRows[i][12] || '') !== hash) continue;
    if (cursoAlvo && normalizarCurso(iRows[i][4]) !== cursoAlvo) continue;
    if (dataAlvo && normalizarData(iRows[i][5]) !== dataAlvo) continue;
    idx = i; break;
  }
  if (idx === -1 && cursoAlvo) {
    for (var j = 1; j < iRows.length; j++) {
      if (String(iRows[j][12] || '') === hash) { idx = j; break; }
    }
  }
  if (idx === -1) return { ok: false, erro: 'Link inválido ou expirado.' };
  var status = String(iRows[idx][9] || '').trim();
  if (status !== 'pago') return { ok: false, erro: 'O certificado é liberado após a confirmação do pagamento.' };
  var concluido = String(iRows[idx][15] || '').toLowerCase() === 'sim';
  if (!concluido) {
    var dtAuto = normalizarData(iRows[idx][5]);
    if (dtAuto) {
      var pp = dtAuto.split('/');
      var dAuto = new Date(parseInt(pp[2], 10), parseInt(pp[1], 10) - 1, parseInt(pp[0], 10));
      var hojeAuto = new Date(); hojeAuto.setHours(0, 0, 0, 0);
      if (!isNaN(dAuto.getTime()) && dAuto < hojeAuto) {
        iSheet.getRange(idx + 1, 16).setValue('sim');
        try { registrarLog('concluido', String(iRows[idx][18] || ''), 'auto gerarcertificado ' + dtAuto, { nome: String(iRows[idx][1] || '').trim() }); } catch (e) {}
        concluido = true;
      }
    }
  }
  if (!concluido) return { ok: false, erro: 'O certificado fica disponível depois da oficina.' };
  var atual = String(iRows[idx][14] || '').trim();
  if (atual) return { ok: true, numero: atual };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { ok: false, erro: 'Sistema ocupado, tente novamente.' }; }
  try {
    var rows = iSheet.getDataRange().getValues();
    var cur = String(rows[idx][14] || '').trim();
    if (cur) return { ok: true, numero: cur };
    var numero = proximoNumeroCertificado(iSheet);
    var n = 'PDV-2026-' + ('00' + numero).slice(-3);
    iSheet.getRange(idx + 1, 15).setValue(n);
    registrarLog('certificado', String(rows[idx][18] || ''), String(rows[idx][4] || ''), { nome: String(rows[idx][1] || '').trim(), numero: n });
    return { ok: true, numero: n };
  } finally {
    lock.releaseLock();
  }
}

function proximoNumeroCertificado(sheet) {
  var values = sheet.getRange(2, 15, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  var n = 0;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim()) n++;
  }
  return n + 1;
}

function registrarCertificados() {
  var iSheet = getSheet('Inscritos');
  var rows = iSheet.getDataRange().getValues();
  var n = proximoNumeroCertificado(iSheet);
  var feitos = 0;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][9] || '').trim() !== 'pago') continue;
    if (String(rows[i][14] || '').trim()) continue;
    iSheet.getRange(i + 1, 15).setValue('PDV-2026-' + ('00' + n).slice(-3));
    n++;
    feitos++;
  }
  registrarLog('certificado', '', 'numeracao em lote', { registrados: feitos });
  return { ok: true, registrados: feitos };
}

function autoConcluirTurmasPassadas() {
  var sh = getSheet('Inscritos');
  var rows = sh.getDataRange().getValues();
  var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  var feitos = 0;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][9] || '').trim() !== 'pago') continue;
    if (String(rows[i][15] || '').toLowerCase() === 'sim') continue;
    var dt = normalizarData(rows[i][5]);
    if (!dt) continue;
    var p = dt.split('/');
    var d = new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10));
    if (isNaN(d.getTime())) continue;
    if (d >= hoje) continue;
    sh.getRange(i + 1, 16).setValue('sim');
    feitos++;
    try { registrarLog('concluido', String(rows[i][18] || ''), 'auto ' + dt, { nome: String(rows[i][1] || '').trim() }); } catch (e) {}
  }
  if (feitos) try { registrarLog('concluido', '', 'auto lote', { marcados: feitos }); } catch (e) {}
  return { ok: true, marcados: feitos };
}

function removerTriggerAutoConcluir() {
  var apagados = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'autoConcluirTurmasPassadas') { ScriptApp.deleteTrigger(t); apagados++; }
  });
  return { ok: true, removidos: apagados };
}

function emailCertificadoPorId(id) {
  var sheet = getSheet('Inscritos');
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(id)) continue;
    return enviarEmailCertificadoRow(sheet, rows, i, true);
  }
  return { ok: false, erro: 'Inscrição não encontrada.' };
}

function enviarEmailsCertificados() {
  var sheet = getSheet('Inscritos');
  var rows = sheet.getDataRange().getValues();
  var enviados = 0;
  for (var i = 1; i < rows.length; i++) {
    var res = enviarEmailCertificadoRow(sheet, rows, i);
    if (res && res.enviado) enviados++;
  }
  return { ok: true, enviados: enviados };
}

function enviarEmailCertificadoRow(sheet, rows, i, forcar) {
  if (String(rows[i][9] || '').trim() !== 'pago') return null;
  if (String(rows[i][15] || '').toLowerCase() !== 'sim') return null;
  var numero = String(rows[i][14] || '').trim();
  var email = String(rows[i][3] || '').trim();
  if (!numero || !email) return null;
  var chave = String(rows[i][0] || '').trim();
  if (!forcar && jaEnviouEmailCertificado(chave)) return { jaEnviado: true };
  var nome = String(rows[i][1] || '').trim();
  var curso = String(rows[i][4] || '').trim();
  var token = String(rows[i][17] || '').trim();
  var link = 'https://ferrarijonas.github.io/paodeverdade/aluno.html?token=' + encodeURIComponent(token);
  var dataAmigavel = formatarDataAmigavel(rows[i][5]);
  var corpo =
    '<div style="font-family:Segoe UI,Arial,sans-serif;color:#212121;max-width:560px;margin:0 auto">' +
    '<h2 style="color:#4A2E1B">Oi, ' + esc(nome) + '!</h2>' +
    '<p>Parabéns pela oficina de <strong>' + esc(curso) + '</strong>' +
    (dataAmigavel ? ' (' + esc(dataAmigavel) + ')' : '') +
    '!</p>' +
    '<p>Seu <strong>certificado de participação</strong> já está liberado.</p>' +
    '<p><a href="' + esc(link) + '" style="display:inline-block;background:#212121;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700">Abrir minha Área do Estudante</a></p>' +
    '<p style="color:#8A7A5C;font-size:.85rem">Pão de Verdade — Forneria Artesanal</p></div>';
  try {
    GmailApp.sendEmail(email, 'Seu certificado está disponível — Pão de Verdade',
      'Acesse sua Área do Estudante para baixar o certificado: ' + link, { htmlBody: corpo });
    registrarLog('certificado_email', chave, curso + ' ' + numero, { nome: nome });
    return { enviado: true };
  } catch (e) {
    Logger.log('email certificado: ' + e);
    return { erro: String(e && e.message || e) };
  }
}

function jaEnviouEmailCertificado(chave) {
  if (!chave) return false;
  try {
    var logs = getSheet('Logs').getDataRange().getValues();
    for (var i = 1; i < logs.length; i++) {
      if (String(logs[i][1] || '') === 'certificado_email' && String(logs[i][2] || '') === chave) return true;
    }
  } catch (e) {}
  return false;
}

function rotinaCertificadosAutomatica() {
  autoConcluirTurmasPassadas();
  enviarEmailsCertificados();
}

function criarTriggerEmailCertificados() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'rotinaCertificadosAutomatica') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('rotinaCertificadosAutomatica').timeBased().everyDays(1).atHour(6).create();
  return { ok: true };
}
