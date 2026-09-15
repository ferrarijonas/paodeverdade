import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

const require = createRequire('C:/Girolano/design/package.json');
const playwright = require('playwright');

const CURSOS = {
  Pão: {
    curso: 'Curso de Pão para Iniciantes',
    horario: 'das 8h às 13h',
    conteudo: 'fermentação natural com o Fermento de Garrafa, percentuais do padeiro, dobras sequenciais, desenvolvimento do glúten e assamento em forno profissional e caseiro',
  },
  Pizza: {
    curso: 'Curso de Pizza Artesanal',
    horario: 'das 17h às 22h',
    conteudo: 'massa de longa fermentação, percentuais do padeiro, autólise, método de desenvolvimento da massa sem sova e assamento em forno profissional e caseiro',
  },
};

const UNID = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];

function numeroExtenso(n) {
  if (n < 20) return UNID[n];
  const d = Math.floor(n / 10), u = n % 10;
  return u ? `${DEZ[d]} e ${UNID[u]}` : DEZ[d];
}

function anoExtenso(n) {
  const mil = Math.floor(n / 1000), rest = n % 1000;
  if (rest === 0) return `${numeroExtenso(mil)} mil`;
  const r = numeroExtenso(rest);
  return `${numeroExtenso(mil)} mil e ${r}`;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function dataExtenso(ddmm) {
  const [d, m, a] = ddmm.split('/').map(Number);
  return `${numeroExtenso(d)} dias do mês de ${MESES[m - 1]} de ${anoExtenso(a)}`;
}

const dados = JSON.parse(readFileSync(resolve('dados.json'), 'utf8'));
const pagos = dados.inscritos.filter((i) => i.status === 'pago');
const filtros = process.argv.slice(2).map((s) => s.toLowerCase());

const alvos = filtros.length
  ? pagos.filter((p) => filtros.some((f) => p.nome.toLowerCase().includes(f)))
  : pagos;

if (!alvos.length) {
  console.error('Nenhum inscrito pago encontrado para o filtro:', filtros.join(', '));
  process.exit(1);
}

const template = readFileSync(resolve('template.html'), 'utf8');
const OUT = resolve('pdf');
mkdirSync(OUT, { recursive: true });

const browser = await playwright.chromium.launch();
try {
  for (const p of alvos) {
    const c = CURSOS[p.curso];
    const idx = pagos.indexOf(p);
    const html = template
      .replaceAll('{{NOME}}', () => p.nome)
      .replaceAll('{{CURSO}}', () => c.curso)
      .replaceAll('{{HORARIO}}', () => c.horario)
      .replaceAll('{{CONTEUDO}}', () => c.conteudo)
      .replaceAll('{{DATA}}', () => dataLonga(p.dataTurma))
      .replaceAll('{{DATA_EXTENSO}}', () => dataExtenso(p.dataTurma))
      .replaceAll('{{NUMERO}}', () => `PDV-2026-${String(idx + 1).padStart(3, '0')}`);
    const tmp = resolve(`_tmp_${p.id}.html`);
    writeFileSync(tmp, html, 'utf8');

    const page = await browser.newPage();
    await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const safe = p.nome.replace(/[^\p{L}\p{N}]+/gu, '_');
    const out = resolve(OUT, `${p.curso}_${safe}.pdf`);
    await page.pdf({
      path: out,
      width: '297mm',
      height: '210mm',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    await page.close();
    unlinkSync(tmp);
    console.log('OK', out);
  }
} finally {
  await browser.close();
}
console.log(`\n${alvos.length} certificado(s) gerado(s) em ${OUT}`);

function dataLonga(ddmm) {
  const [d, m, a] = ddmm.split('/').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}
