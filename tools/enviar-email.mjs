#!/usr/bin/env node
/* Envia e-mail de divulgação pelo backend (Apps Script).
   Uso:
     node tools/enviar-email.mjs teste --para email@exemplo.com [--nome Jonas] [--modelo turma1411]
     node tools/enviar-email.mjs lote --dryrun [--modelo turma1411] [--limite 40]
     node tools/enviar-email.mjs alunos --curso Pizza [--modelo turma1411] [--dryrun] [--limite 40]
     node tools/enviar-email.mjs historico [--campanha turma1411-xxxxxx] [--limite 50]
   Env: PAINEL_SENHA (obrigatória), WEB_APP_URL (opcional). */
const BRANCO = 'https://script.google.com/macros/s/AKfycbxHyN1-ZU49ZH4wU92MHw8PlgLayxVSiszJ7iGG47jdampR5CrTDK2hmo4OH0koPaKRtQ/exec';

const [modo, ...args] = process.argv.slice(2);
const senha = process.env.PAINEL_SENHA || '';
const base = process.env.WEB_APP_URL || BRANCO;

function opt(nome, padrao) {
  const i = args.indexOf('--' + nome);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : padrao;
}
const flag = (nome) => args.includes('--' + nome);

if (!senha) {
  console.error('Defina PAINEL_SENHA no ambiente.');
  process.exit(1);
}

const acao = {
  teste: 'emailteste',
  lote: 'disparoespera',
  alunos: 'disparoalunos',
  historico: 'emailhistorico'
}[modo];
if (!acao) {
  console.error('Uso: teste --para ... | lote [--dryrun] | alunos --curso Pão|Pizza [--dryrun] | historico');
  process.exit(1);
}

const params = { acao, senha };
if (modo === 'historico') {
  params.limite = opt('limite', '50');
  const campanha = opt('campanha', '');
  if (campanha) params.campanha = campanha;
} else {
  params.modelo = opt('modelo', 'turma1411');
  if (modo === 'teste') {
    const para = opt('para', '');
    if (!para) {
      console.error('Informe --para email@exemplo.com');
      process.exit(1);
    }
    params.para = para;
    params.nome = opt('nome', 'Jonas');
  } else {
    if (modo === 'alunos') {
      const curso = opt('curso', '');
      if (!curso) {
        console.error('Informe --curso Pão, --curso Pizza ou --curso Ambos');
        process.exit(1);
      }
      params.curso = curso;
    }
    params.limite = opt('limite', '40');
    if (flag('dryrun')) params.dryrun = '1';
  }
}

const url = base + '?' + new URLSearchParams(params).toString();
const res = await fetch(url, { redirect: 'follow' });
const texto = await res.text();
try {
  console.log(JSON.stringify(JSON.parse(texto), null, 2));
} catch {
  console.error('Resposta não-JSON (HTTP ' + res.status + '):');
  console.error(texto.slice(0, 500));
  process.exit(1);
}
