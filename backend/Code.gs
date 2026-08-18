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
  return PROPS.getProperty('PAINEL_SENHA') || 'paodeverdade2026';
}
function getWebAppUrl() {
  return PROPS.getProperty('WEB_APP_URL') || ScriptApp.getService().getUrl();
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
    .addItem('Criar abas da planilha', 'criarAbas')
    .addToUi();
}

/* ---------------------------------------------------------
   doGet — serve o painel (com senha)
   URL:  {web_app_url}/exec?senha=SUA_SENHA
   --------------------------------------------------------- */
function doGet(e) {
  if (e && e.parameter && e.parameter.acao === 'aluno') {
    return buscarAreaAluno(e.parameter.token || '');
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
    return HtmlService.createHtmlOutputFromFile('painel')
      .setTitle('Pão de Verdade — Painel de Inscrições')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createHtmlOutput(
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
    '<p>Digite a senha para acessar.</p>' +
    '<input type="password" name="senha" placeholder="Senha" required>' +
    '<button type="submit">Entrar</button></form></body></html>'
  );
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
  var nome = (d.nome || '').trim();
  var whats = (d.whatsapp || '').trim();
  var email = (d.email || '').trim();
  var curso = (d.curso || '').trim();
  var dataTurma = (d.dataTurma || '').trim();
  var valor = parseFloat(d.valor) || 275;

  if (!nome || !email) {
    return jsonOut({ ok: false, erro: 'Preencha nome e e-mail.' });
  }

  var sheet = getSheet('Inscritos');
  var rowId = generateId(sheet);

  var pref = criarPreferenciaMP({
    id: rowId,
    nome: nome,
    email: email,
    curso: curso,
    dataTurma: dataTurma,
    valor: valor
  });

  if (!pref || !pref.init_point) {
    return jsonOut({ ok: false, erro: 'Não foi possível criar o pagamento. Tente novamente.' });
  }

  var now = new Date();
  sheet.appendRow([
    rowId, nome, whats, email, curso, dataTurma, valor,
    pref.id, '', 'aguardando', 'não', formatDate(now),
    '', '', '', 'não', 'não'
  ]);

  /* Página que redireciona o aluno pro checkout do MP */
  var html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">' +
    '<title>Redirecionando…</title></head><body>' +
    '<p>Preparando seu pagamento seguro…</p>' +
    '<script>window.location.replace(' + JSON.stringify(pref.init_point) + ');</script>' +
    '</body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle('Redirecionando para o pagamento')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
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
      success: baseUrl + 'index.html?pagamento=aprovado',
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
  var r = sheet.getRange(row, 1, 1, 17).getValues()[0];
  var email = String(r[3] || '').trim();
  var nome = String(r[1] || '').trim();
  if (!email || String(r[16] || '').toLowerCase() === 'sim') return;

  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var hash = hashToken(token);
  sheet.getRange(row, 13).setValue(hash);

  var link = 'https://ferrarijonas.github.io/paodeverdade/aluno.html?token=' + encodeURIComponent(token);
  var corpo = '<div style="font-family:Segoe UI,Arial,sans-serif;color:#212121;max-width:560px;margin:0 auto">' +
    '<h2 style="color:#4A2E1B">Oi, ' + esc(nome) + '!</h2>' +
    '<p>Seu pagamento foi confirmado. Sua Área do Aluno já está disponível:</p>' +
    '<p><a href="' + esc(link) + '" style="display:inline-block;background:#212121;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700">Abrir minha Área do Aluno</a></p>' +
    '<p>Por lá você encontrará os materiais da oficina, o link do grupo e, depois do curso, o certificado.</p>' +
    '<p style="color:#8A7A5C;font-size:.85rem">Pão de Verdade — Forneria Artesanal</p></div>';
  GmailApp.sendEmail(email, 'Sua Área do Aluno — Pão de Verdade', 'Acesse sua Área do Aluno: ' + link, { htmlBody: corpo });
  sheet.getRange(row, 17).setValue('sim');
}

function buscarAreaAluno(token) {
  if (!token || token.length < 20) return jsonOut({ ok: false, erro: 'Link inválido.' });
  var hash = hashToken(token);
  var rows = getSheet('Inscritos').getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][12] || '') !== hash) continue;
    if (String(rows[i][9] || '') !== 'pago') return jsonOut({ ok: false, erro: 'Pagamento ainda não confirmado.' });
    return jsonOut({ ok: true, aluno: {
      nome: rows[i][1], curso: rows[i][4], dataTurma: rows[i][5],
      grupo: buscarLinkGrupo(rows[i][4], rows[i][5]),
      apostila: rows[i][13] || '', certificado: rows[i][14] || '',
      concluido: String(rows[i][15] || '').toLowerCase() === 'sim'
    }});
  }
  return jsonOut({ ok: false, erro: 'Link inválido ou expirado.' });
}

function buscarLinkGrupo(curso, dataTurma) {
  var rows = getSheet('Turmas').getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim() === String(curso || '').trim() &&
        String(rows[i][1] || '').trim() === String(dataTurma || '').trim()) return String(rows[i][2] || '');
  }
  return '';
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
  var assunto = 'Seu convite para o grupo da oficina de ' + curso +
    (dataTurma ? ' (' + dataTurma + ')' : '');
  var corpo =
    '<div style="font-family:Segoe UI,Arial,sans-serif;color:#212121;max-width:560px;margin:0 auto">' +
    '<h2 style="color:#4A2E1B">Oi, ' + esc(nome) + '!</h2>' +
    '<p>Sua vaga na oficina de <strong>' + esc(curso) + '</strong>' +
    (dataTurma ? ' do dia <strong>' + esc(dataTurma) + '</strong>' : '') +
    ' está confirmada. Que alegria!</p>' +
    '<p>Entra no grupo da turma pra gente se organizar:</p>' +
    '<p><a href="' + esc(link) + '" style="display:inline-block;background:#212121;color:#fff;' +
    'padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700">' +
    'Entrar no grupo da turma</a></p>' +
    '<p>Qualquer dúvida, é só chamar no WhatsApp: <strong>(34) 93618-6847</strong>.</p>' +
    '<p>Te esperamos no forno! 🍞</p>' +
    '<p style="color:#8A7A5C;font-size:.85rem">Pão de Verdade — Forneria Artesanal</p>' +
    '</div>';
  GmailApp.sendEmail(email, assunto, 'Entra no grupo da turma: ' + link, {
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
  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    out.push({ curso: rows[i][0], dataTurma: rows[i][1], linkGrupo: rows[i][2] });
  }
  return out;
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
    'AreaTokenHash', 'ApostilaURL', 'CertificadoURL', 'Concluido', 'AcessoEnviado']);
  ensureSheet(ss, 'Turmas', ['Curso', 'DataTurma', 'LinkGrupo']);
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

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
