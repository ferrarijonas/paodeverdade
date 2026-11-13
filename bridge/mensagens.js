const LINKS = {
  pao: 'https://ferrarijonas.github.io/paodeverdade/checkout.html?curso=P%C3%A3o&data=14%2F11%2F2026&utm_source=whatsapp&utm_medium=zap&utm_campaign=turma1411',
  massas: 'https://ferrarijonas.github.io/paodeverdade/checkout.html?curso=Massas%20Doces&data=14%2F11%2F2026&utm_source=whatsapp&utm_medium=zap&utm_campaign=turma1411'
};

const TEXTOS = {
  'espera':
    '{saudacao} Abriu a turma de 14/11 da Pão de Verdade: Pão de manhã (8h às 13h) e Massas Doces à tarde (14h às 19h). R$ 275 cada, poucas vagas.\n\nPão: {linkPao}\nMassas Doces: {linkMassas}',
  'alunos:Pão':
    '{saudacao} Você já fez o Pão com a gente — agora abriu o Massas Doces, dia 14/11 à tarde (14h às 19h). R$ 275, poucas vagas.\n\nGaranta a sua: {linkMassas}',
  'alunos:Pizza':
    '{saudacao} Dia 14/11 tem Pão de manhã e Massas Doces à tarde. R$ 275 cada, poucas vagas.\n\nPão: {linkPao}\nMassas Doces: {linkMassas}'
};

module.exports = { LINKS, TEXTOS };
