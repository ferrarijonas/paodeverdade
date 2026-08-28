/* =====================================================================
 * ZenSpecKit — reorder.js
 * Mantém a ordem das specs de Specs/<modulo>/ na ordem de leitura.
 * A ordem vive em Specs/.ordem.json ({ modulo: ["arquivo.md", ...] }) —
 * fonte da verdade; o prefixo NN- é só projeção dela (ordem de leitura,
 * o nome após o prefixo é o programa). Arquivo novo → registre a posição
 * no .ordem.json, depois rode --fix.
 *
 * Uso (da raiz do projeto):
 *   node ZenSpecKit/reorder.js --check     → exit 1 se algo quebrou
 *   node ZenSpecKit/reorder.js --fix       → renumera os módulos
 *   node ZenSpecKit/reorder.js --self-test → auto-teste em pasta temporária
 * ===================================================================== */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const modo = process.argv[2];
if (!["--check", "--fix", "--self-test"].includes(modo)) {
  console.error("uso: node ZenSpecKit/reorder.js --check | --fix | --self-test");
  process.exit(2);
}

function acharSpecs() {
  let dir = process.cwd();
  for (;;) {
    const specs = path.join(dir, "Specs");
    if (fs.existsSync(path.join(specs, ".ordem.json"))) return specs;
    const pai = path.dirname(dir);
    if (pai === dir) return null;
    dir = pai;
  }
}

function lerOrdem(specs) {
  const arquivo = path.join(specs, ".ordem.json");
  try {
    return JSON.parse(fs.readFileSync(arquivo, "utf8"));
  } catch {
    console.error(`Specs/.ordem.json inválido — revise ${arquivo}`);
    process.exit(2);
  }
}

function validar(specs, m) {
  const ordens = lerOrdem(specs);
  let quebrou = false;
  const reportar = (msg) => { console.error(msg); quebrou = true; };
  const base = (nome) => nome.replace(/^\d+-/, "");

  for (const nome of fs.readdirSync(specs)) {
    if (fs.statSync(path.join(specs, nome)).isDirectory() && !(nome in ordens)) {
      reportar(`MÓDULO FORA DO JSON: ${nome} — adicione a ordem dele em Specs/.ordem.json`);
    }
  }

  for (const [modulo, ordem] of Object.entries(ordens)) {
    const dir = path.join(specs, modulo);
    if (!fs.existsSync(dir)) {
      reportar(`MÓDULO SEM PASTA: ${modulo} — a pasta Specs/${modulo} não existe`);
      continue;
    }

    const vistos = new Set();
    for (const nome of ordem) {
      if (vistos.has(nome)) reportar(`NOME DUPLICADO [${modulo}]: ${nome}`);
      vistos.add(nome);
    }

    const largura = Math.max(2, String(ordem.length).length);
    const nomesOk = ordem.map((n, i) => String(i).padStart(largura, "0") + "-" + n);
    const presentes = new Set(fs.readdirSync(dir).filter((n) => n.endsWith(".md")).map(base));

    for (const nome of fs.readdirSync(dir)) {
      if (!nome.endsWith(".md")) continue;
      const alvo = nomesOk[ordem.indexOf(base(nome))];
      if (!alvo) {
        reportar(`FORA DA ORDEM [${modulo}]: ${nome} — adicione a posição em Specs/.ordem.json`);
      } else if (nome !== alvo) {
        if (m === "--fix") {
          fs.renameSync(path.join(dir, nome), path.join(dir, alvo));
          console.log(`renomeado: ${nome} → ${alvo}`);
        } else {
          reportar(`fora do lugar [${modulo}]: ${nome} → esperado ${alvo}`);
        }
      }
    }

    ordem.forEach((nome) => {
      if (!presentes.has(nome)) reportar(`SUMIDO DO DISCO [${modulo}]: ${nome}`);
    });
  }
  return quebrou;
}

function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reorder-"));
  try {
    const specs = path.join(tmp, "Specs");
    const mod = path.join(specs, "alpha");
    fs.mkdirSync(mod, { recursive: true });
    fs.writeFileSync(path.join(specs, ".ordem.json"), JSON.stringify({ alpha: ["a.md", "b.md"] }));
    fs.writeFileSync(path.join(mod, "01-b.md"), "");
    fs.writeFileSync(path.join(mod, "02-a.md"), "");
    fs.writeFileSync(path.join(mod, "99-x.md"), "");

    if (!validar(specs, "--fix")) throw new Error("fix deveria apontar o arquivo fora da ordem");
    if (!fs.existsSync(path.join(mod, "00-a.md")) || fs.existsSync(path.join(mod, "02-a.md"))) {
      throw new Error("00-a.md não renomeado");
    }

    fs.unlinkSync(path.join(mod, "99-x.md"));
    if (validar(specs, "--check")) throw new Error("check deveria passar na árvore arrumada");

    console.log("self-test ok");
    process.exit(0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (modo === "--self-test") selfTest();

const specs = acharSpecs();
if (!specs) {
  console.error("Specs/.ordem.json não encontrado — rode da raiz do projeto (ou subpasta) que usa o kit.");
  process.exit(2);
}

const quebrou = validar(specs, modo);
if (modo === "--check" && !quebrou) console.log("ordem ok");
process.exit(quebrou ? 1 : 0);
