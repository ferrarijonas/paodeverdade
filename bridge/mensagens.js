const LINKS = {
  pao: 'https://ferrarijonas.github.io/paodeverdade/checkout.html?curso=P%C3%A3o&data=14%2F11%2F2026&utm_source=whatsapp&utm_medium=zap&utm_campaign=turma1411',
  massas: 'https://ferrarijonas.github.io/paodeverdade/checkout.html?curso=Massas%20Doces&data=14%2F11%2F2026&utm_source=whatsapp&utm_medium=zap&utm_campaign=turma1411'
};

const TEXTOS = {
  /* boas-vindas da lista de espera: não é oferta, não tem preço nem prazo.
     Escrito em parágrafos curtos, como mensagem de gente — não como e-mail. */
  'boasvindas':
    '{saudacao} Aqui é o agente do Jonas, da Pão de Verdade.\n\n' +
    'Você entrou na lista de espera das oficinas. Deixa eu explicar em 30 segundos como funciona.\n\n' +
    'A gente abre uma turma por mês, num fim de semana. No começo de cada mês eu te mando as datas e você responde quais servem pra você. Leva um minuto.\n\n' +
    'A turma que abre é a data que mais gente marcou, e ela fecha com 6 pessoas pagas.\n\n' +
    'Não tem venda aqui, e eu não fico te cutucando todo dia.\n\n' +
    'Se num mês não der, responde 0 que eu pulo você naquele mês. Se não quiser mais receber, responde SAIR.',
  'espera':
    '{saudacao} Abriu a turma de 14/11 da Pão de Verdade: Pão de manhã (8h às 13h) e Massas Doces à tarde (14h às 19h). R$ 275 cada, poucas vagas.\n\nPão: {linkPao}\nMassas Doces: {linkMassas}',
  'alunos:Pão':
    '{saudacao} Você já fez o Pão com a gente — agora abriu o Massas Doces, dia 14/11 à tarde (14h às 19h). R$ 275, poucas vagas.\n\nGaranta a sua: {linkMassas}',
  'alunos:Pizza':
    '{saudacao} Dia 14/11 tem Pão de manhã e Massas Doces à tarde. R$ 275 cada, poucas vagas.\n\nPão: {linkPao}\nMassas Doces: {linkMassas}'
};

module.exports = { LINKS, TEXTOS };
