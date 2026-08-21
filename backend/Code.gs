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

  if (e && e.parameter && e.parameter.acao === 'validarcodigo') {
    return responder(validarCodigo(e.parameter.codigo), e.parameter.callback);
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

  var bruto = itens.length * PRECO_OFICINA;
  var codigo = String(d.codigo || '').trim().toUpperCase();
  var descCalc = calcularDescontoPedido(itens.length, pessoas, codigo);
  if (descCalc.erro) return { ok: false, erro: descCalc.erro };
  var desconto = descCalc.desconto || 0;
  var total = Math.round((bruto - desconto) * 100) / 100;

  var pSheet = getSheet('Pedidos');
  var pedidoId = 'PED' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
  var now = new Date();
  pSheet.appendRow([pedidoId, 'aguardando', bruto, desconto, total, metodo, formatDate(now), '', '', codigo, '']);
  var pedidoRow = pSheet.getLastRow();
  if (descCalc.tipo === 'cupom') usarCupom(codigo, pedidoId);

  var pesSheet = getSheet('Pessoas');
  var iSheet = getSheet('Inscritos');
  var pessoasCriadas = [];
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

  var primeiroEmail = pessoasCriadas.length ? pessoasCriadas[0].email : '';
  if (metodo === 'cartao') {
    var pref = criarPreferenciaMPPedido(pedidoId, total, primeiroEmail);
    if (!pref || !pref.init_point) return { ok: false, pedido: pedidoId, erro: 'Não foi possível criar o pagamento.' };
    pSheet.getRange(pedidoRow, 8).setValue(pref.id);
    return { ok: true, pedido: pedidoId, bruto: bruto, desconto: desconto, total: total, url: pref.init_point, pessoas: pessoasCriadas };
  }
  if (metodo === 'pixmp' || metodo === 'pix_mp') {
    var pix = criarPixMPPedido(pedidoId, total, primeiroEmail);
    if (!pix || !pix.ok) return { ok: false, pedido: pedidoId, erro: (pix && pix.erro) || 'Não foi possível gerar o Pix.' };
    pSheet.getRange(pedidoRow, 9).setValue(pix.id);
    return { ok: true, pedido: pedidoId, bruto: bruto, desconto: desconto, total: total, id: pix.id, qr: pix.qr, copia: pix.copia, pessoas: pessoasCriadas };
  }
  return { ok: true, pedido: pedidoId, bruto: bruto, desconto: desconto, total: total, manual: true, pessoas: pessoasCriadas };
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

function finalizarPedido(pedidoId) {
  var pSheet = getSheet('Pedidos');
  var pRows = pSheet.getDataRange().getValues();
  for (var i = 1; i < pRows.length; i++) {
    if (String(pRows[i][0]) !== String(pedidoId)) continue;
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
    return { ok: true, msg: 'Cupom válido! Desconto aplicado.' };
  }
  var convite = buscarConvite(c);
  if (!convite) return { ok: false, erro: 'Código inválido. Confira e tente novamente.' };
  return { ok: true, msg: 'Código válido! Desconto de 15% aplicado.' };
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
        pedidoId: rows[i][6], anotacao: rows[i][7]
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

function buscarAlunoDados(token) {
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
      for (var k = 1; k < iRows.length; k++) {
        if (String(iRows[k][19]) !== pessoaId) continue;
        var turma = { linkGrupo: '', apostilaURL: '', aviso: '' };
        try { turma = buscarDetalhesTurma(iRows[k][4], iRows[k][5]); } catch (err) { Logger.log(err); }
        cursos.push({
          curso: iRows[k][4],
          dataTurma: normalizarData(iRows[k][5]),
          grupo: turma.linkGrupo,
          aviso: turma.aviso,
          apostila: iRows[k][13] || turma.apostilaURL || '',
          certificado: iRows[k][14] || '',
          concluido: String(iRows[k][15] || '').toLowerCase() === 'sim'
        });
      }
      if (cursos.length) return { ok: true, aluno: { nome: nome, cursos: cursos, codigoConvite: garantirCodigoConvite('Pessoas', p), credito: Number(pesRows[p][10] || 0) } };
    }
  } catch (err) { Logger.log('Pessoas: ' + err); }

  for (var i = 1; i < iRows.length; i++) {
    if (String(iRows[i][12] || '') !== hash) continue;
    var turma = { linkGrupo: '', apostilaURL: '', aviso: '' };
    try { turma = buscarDetalhesTurma(iRows[i][4], iRows[i][5]); } catch (err) { Logger.log(err); }
    return { ok: true, aluno: {
      nome: iRows[i][1], curso: iRows[i][4], dataTurma: normalizarData(iRows[i][5]),
      grupo: turma.linkGrupo,
      aviso: turma.aviso,
      apostila: iRows[i][13] || turma.apostilaURL || '', certificado: iRows[i][14] || '',
      concluido: String(iRows[i][15] || '').toLowerCase() === 'sim',
      codigoConvite: garantirCodigoConvite('Inscritos', i),
      credito: Number(iRows[i][21] || 0)
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
    var pedidoId = String(rows[i][18] || '');
    var pessoaId = String(rows[i][19] || '');
    out.push({
      id: rows[i][0], nome: rows[i][1], whatsapp: rows[i][2], email: rows[i][3],
      curso: rows[i][4], dataTurma: normalizarData(rows[i][5]), valor: rows[i][6],
      pref: rows[i][7], payment: rows[i][8], status: rows[i][9],
      linkEnviado: rows[i][10], registro: formatarRegistro(rows[i][11]),
      concluido: rows[i][15],
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
  var sheet = getSheet('Turmas');
  var numCols = sheet.getLastColumn();
  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    out.push({ curso: rows[i][0], dataTurma: normalizarData(rows[i][1]), linkGrupo: numCols >= 3 ? rows[i][2] : '' });
  }
  return out;
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
  return { inscritos: listarInscritos(), turmas: listarTurmas(), pedidos: listarPedidos(), cupons: listarCupons() };
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
    'AreaTokenHash', 'ApostilaURL', 'CertificadoURL', 'Concluido', 'AcessoEnviado', 'AreaToken',
    'PedidoID', 'PessoaID', 'CodigoConvite', 'Credito', 'Anotacao', 'CPF']);
  ensureSheet(ss, 'Turmas', ['Curso', 'DataTurma', 'LinkGrupo', 'ApostilaURL', 'AvisoTurma']);
  ensureSheet(ss, 'Pedidos', ['PedidoID', 'Status', 'ValorBruto', 'Desconto', 'ValorTotal', 'FormaPagamento', 'RegistradoEm', 'PrefID', 'PaymentID', 'CodigoUsado', 'Anotacao']);
  ensureSheet(ss, 'Pessoas', ['PessoaID', 'PedidoID', 'Nome', 'WhatsApp', 'Email', 'AreaTokenHash', 'AreaToken', 'Cursos', 'AcessoEnviado', 'CodigoConvite', 'Credito', 'Anotacao', 'CPF']);
  ensureSheet(ss, 'Cupons', ['Codigo', 'Tipo', 'Valor', 'Status', 'CriadoEm', 'UsadoEm', 'PedidoID', 'Anotacao']);
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
