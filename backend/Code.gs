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
  if (e && e.parameter && e.parameter.acao === 'aluno') {
    if (e.parameter.callback) {
      var callback = String(e.parameter.callback).replace(/[^a-zA-Z0-9_$.]/g, '');
      return ContentService.createTextOutput(callback + '(' + JSON.stringify(buscarAlunoComErro(e.parameter.token || '')) + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonOut(buscarAlunoComErro(e.parameter.token || ''));
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

  if (e && e.parameter && e.parameter.acao === 'confirmar') {
    if (e.parameter.senha !== getPainelSenha()) {
      return responder({ ok: false, erro: 'Senha incorreta.' }, e.parameter.callback);
    }
    return responder(confirmarPagamento(e.parameter.id), e.parameter.callback);
  }

  if (e && e.parameter && e.parameter.acao === 'manutencao' && e.parameter.senha === getPainelSenha()) {
    return jsonOut(manutencao());
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
    return ContentService.createTextOutput(montarPainel())
      .setMimeType(ContentService.MimeType.HTML);
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
    hashToken(areaToken), '', '', '', 'não', 'não', areaToken
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
    hashToken(areaToken), '', '', '', 'não', 'não', areaToken
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
    sheet.getRange(i + 1, 17).setValue('não');
    sheet.getRange(i + 1, 18).setValue('');
    sheet.getRange(i + 1, 13).setValue('');
    enviarAcessoAluno(i + 1);
    return { ok: true };
  }
  return { ok: false, erro: 'Inscrição não encontrada.' };
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

    sheet.getRange(i + 1, 17).setValue('não');
    sheet.getRange(i + 1, 18).setValue('');
    sheet.getRange(i + 1, 13).setValue('');
    enviarAcessoAluno(i + 1);
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

function buscarAlunoDados(token) {
  if (!token || token.length < 20) return { ok: false, erro: 'Link inválido.' };
  var hash = hashToken(token);
  var rows = getSheet('Inscritos').getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][12] || '') !== hash) continue;
    var turma = { linkGrupo: '', apostilaURL: '', aviso: '' };
    try { turma = buscarDetalhesTurma(rows[i][4], rows[i][5]); } catch (err) { Logger.log(err); }
    return { ok: true, aluno: {
      nome: rows[i][1], curso: rows[i][4], dataTurma: normalizarData(rows[i][5]),
      grupo: turma.linkGrupo,
      aviso: turma.aviso,
      apostila: rows[i][13] || turma.apostilaURL || '', certificado: rows[i][14] || '',
      concluido: String(rows[i][15] || '').toLowerCase() === 'sim'
    }};
  }
  return { ok: false, erro: 'Link inválido ou expirado.' };
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
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    out.push({
      id: rows[i][0], nome: rows[i][1], whatsapp: rows[i][2], email: rows[i][3],
      curso: rows[i][4], dataTurma: rows[i][5], valor: rows[i][6],
      pref: rows[i][7], payment: rows[i][8], status: rows[i][9],
      linkEnviado: rows[i][10], registro: rows[i][11]
    });
  }
  return out;
}

function listarTurmas() {
  var sheet = getSheet('Turmas');
  var numCols = sheet.getLastColumn();
  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    out.push({ curso: rows[i][0], dataTurma: rows[i][1], linkGrupo: numCols >= 3 ? rows[i][2] : '' });
  }
  return out;
}

function montarPainel() {
  var html = HtmlService.createHtmlOutputFromFile('painel').getContent();
  var dados = listarPainelDados();
  html = html.replace('"__DADOS__"', JSON.stringify(dados).replace(/<\//g, '<\\/'));
  html = html.replace('"__SENHA__"', String(getPainelSenha()));
  html = html.replace('"__ENDPOINT__"', getWebAppUrl());
  return html;
}

function listarPainelDados() {
  return { inscritos: listarInscritos(), turmas: listarTurmas() };
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
function getSheet(nome) {
  var id = getSheetId();
  if (!id) throw new Error('SHEET_ID não configurado.');
  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName(nome);
  if (!sh) throw new Error('Aba "' + nome + '" não existe. Rode o menu "Criar abas da planilha".');
  return sh;
}

function criarAbas() {
  var id = getSheetId();
  var ss = SpreadsheetApp.openById(id);
  ensureSheet(ss, 'Inscritos', ['ID', 'Nome', 'WhatsApp', 'Email', 'Curso', 'DataTurma',
    'Valor', 'PrefID', 'PaymentID', 'Status', 'LinkEnviado', 'RegistradoEm',
    'AreaTokenHash', 'ApostilaURL', 'CertificadoURL', 'Concluido', 'AcessoEnviado', 'AreaToken']);
  ensureSheet(ss, 'Turmas', ['Curso', 'DataTurma', 'LinkGrupo', 'ApostilaURL', 'AvisoTurma']);
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
