# E-mail de divulgação — Pão de Verdade (spec)

Envio de e-mail para a base de alunos (avisos de turma, curso novo) usando o
`GmailApp` do próprio Apps Script. Sem serviço externo, sem SMTP, sem chave nova.

## Conta e limites

- **Remetente:** a conta dona do script — `paodeverdadeudi@gmail.com` (Gmail comum).
- **Reply-to:** `contato@jonasferrari.com.br` (`NOTIFICAR_EMAIL`).
- **Limite do Gmail comum:** ~100 destinatários/dia, somando **todos** os e-mails
  (inclusive confirmação e NFS-e). Por isso o disparo usa teto de **90/dia**
  contando só o que esta ferramenta registra, e **40 por chamada** (máx. 80).

## Endpoints (todos com `senha`)

| Ação | Função | O que faz |
|---|---|---|
| `emailteste` | `emailTeste(p)` | envia **1** e-mail de um modelo fixo. Params: `para`, `modelo` (default `turma1411`), `nome` (default `Jonas`). |
| `emailpreview` | `emailPreview(p)` | devolve `assunto` e `texto` do modelo **sem enviar** (revisão). |
| `disparoespera` | `disparoEspera(p)` | envia o modelo para a **lista de espera** (aba `ListaEspera`), dedup por e-mail. Params: `modelo`, `limite` (default 40, máx. 80), `dryrun=1` (só simula). |
| `disparoalunos` | `disparoAlunos(p)` | envia para **alunos pagos** filtrados por curso. Params: `curso` (`Pão`, `Pizza` ou `Ambos`), `modelo`, `limite`, `dryrun=1`. |
| `emailhistorico` | `emailHistorico(p)` | campanhas + últimos envios. Params: `campanha` (filtro), `limite` (default 50, máx. 200). |
| `modelos` | `listarModelos()` | lista os moldes guardados (nome, assunto, texto, tamanho do HTML). |

Modelos ficam em `montarEmailModelo()` no `backend/Code.gs` — **não** aceita HTML
livre pela URL (evita relay aberto). Hoje existem dois:

| Modelo | Para quem | Conteúdo |
|---|---|---|
| `turma1411` | lista de espera + ex-alunos de **Pizza** | Pão de manhã + Massas Doces à tarde, dois CTAs |
| `massas-pao` | ex-alunos de **Pão** | só Massas Doces (não reoferece Pão), um CTA |

### Exemplo (PowerShell)

```powershell
curl.exe -sL -G "https://script.google.com/macros/s/AKfycbxHyN1-ZU49ZH4wU92MHw8PlgLayxVSiszJ7iGG47jdampR5CrTDK2hmo4OH0koPaKRtQ/exec" `
  --data-urlencode "acao=emailteste" `
  --data-urlencode "senha=..." `
  --data-urlencode "para=contato@jonasferrari.com.br" `
  --data-urlencode "modelo=turma1411"
```

## Público e idempotência

- Público = **lista de espera** (aba `ListaEspera`) ou **alunos pagos** (aba `Inscritos`, filtro por `curso`), sempre **dedup por e-mail**.
- Cada envio grava uma linha na aba `Emails`:
  `Data | Modelo | Email | Nome | Status | Campanha | Assunto | Publico`.
  `Publico` registra o segmento: `espera`, `alunos:Pão`, `alunos:Pizza`, `alunos:Ambos` ou `teste`.
- `disparoespera` / `disparoalunos` pulam quem já recebeu aquele modelo (`Status = enviado`).
- Interrupção no meio do lote não repete ninguém: a linha é gravada logo após o envio.
- `dryrun=1` devolve total, já enviados, pendentes, cota do dia e 5 e-mails de amostra.

## Histórico (o que foi enviado, para quem e com que texto)

- **Aba `Campanhas`** — uma linha por versão de conteúdo:
  `Campanha | Modelo | Assunto | Corpo | CriadoEm`.
  A `Campanha` é `<modelo>-<hash6>` do assunto + corpo. Se o texto mudar, o hash
  muda e nasce outra campanha — o corpo antigo fica preservado.
- **Aba `Emails`** — uma linha por envio:
  `Data | Modelo | Email | Nome | Status | Campanha | Assunto | Publico`.
  `Status`: `enviado` · `teste` · `erro:<msg>`. Quem/quando/assunto/segmento ficam
  na linha; o texto exato está em `Campanhas.Corpo`.
- **`?acao=emailhistorico&senha=&campanha=&limite=`** — campanhas com
  enviados/falhas + últimos envios (quem, quando, assunto, campanha).
- **CLI:** `node tools/enviar-email.mjs historico [--campanha X]`.
- **Retry:** falha grava `erro:` e **não** conta como `enviado`, então o próximo
  `disparoespera` tenta de novo só quem falhou.
- As colunas novas são criadas/estendidas no primeiro envio; para forçar,
  `?acao=criarabas&senha=`.

## Moldes (reuso)

Os textos ficam na aba **`Modelos`**: `Nome | Assunto | Texto | Html | AtualizadoEm`.
O backend lê essa aba antes de qualquer modelo embutido; editar a planilha muda o
e-mail **sem deploy**.

- **Placeholders:** `{saudacao}` vira `Oi, Nome,` (ou `Oi,` sem nome) e `{nome}` é
  substituído pelo nome do aluno.
- **Modelo novo:** duplique uma linha, troque `Nome` (ex.: `turma1412`), edite
  `Assunto`, `Texto` e `Html`. Depois use `modelo=turma1412`.
- **Histórico preservado:** mudar um molde **não** altera o que já foi enviado —
  cada campanha guarda o corpo usado em `Campanhas.Corpo`.
- Se a aba estiver vazia, o backend semeia `turma1411` e `massas-pao` a partir do
  código. Se um modelo existir só na planilha, o código não o conhece (fallback
  apenas para os dois embutidos).
- O `Html` é opcional: se ficar vazio, o e-mail sai só em texto.

## Operação

1. `emailteste` para `contato@jonasferrari.com.br` e revisar no Gmail (inclusive spam).
2. `disparoespera&dryrun=1` (ou `disparoalunos&curso=Pizza&dryrun=1`) para conferir o público.
3. `disparoespera&limite=40` / `disparoalunos&curso=Pizza&limite=40` e repetir no dia seguinte se faltar gente.
4. `emailhistorico` (ou a aba `Emails`) para conferir quem recebeu e o que falhou.

Segmentação do 14/11: `turma1411` para lista de espera e ex-alunos de Pizza;
`massas-pao` para ex-alunos de Pão. Ninguém recebe o mesmo modelo duas vezes.

CLI: `node tools/enviar-email.mjs teste --para ...` / `node tools/enviar-email.mjs lote --dryrun`
(a senha vem de `PAINEL_SENHA` no ambiente).

## Regras

- **Sem descadastro não sai:** o rodapé traz "responda com sair". Quem responder
  deve ser marcado com `Status = sair` na aba `Emails` e não recebe mais.
- **Uma campanha por modelo.** Criar modelo novo (não reaproveitar o nome) para
  não confundir a deduplicação. Se mudar o texto e quiser reenviar para quem já
  recebeu, crie um modelo novo (ex.: `turma1411b`) — o dedup é por modelo.
- Preço, data e promessa precisam estar aprovados antes do disparo (`Anuncios/AGENTS.md`).
- O `emailteste` para o próprio dono não exige aprovação; disparo para alunos, sim.

## Arquivos

| Arquivo | Papel |
|---|---|
| `backend/Code.gs` | modelos + envio + público + registro |
| `pdv-clasp/Code.js` | espelho de deploy (cópia exata) |
| `docs/EMAIL.md` | esta spec |
| `tools/enviar-email.mjs` | CLI de teste e lote |
