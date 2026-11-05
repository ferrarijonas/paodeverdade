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
| `disparoalunos` | `disparoAlunos(p)` | envia o modelo para alunos **pagos** da aba `Inscritos`. Params: `modelo`, `limite` (default 40, máx. 80), `dryrun=1` (só simula). |

Modelos ficam em `montarEmailModelo()` no `backend/Code.gs` — **não** aceita HTML
livre pela URL (evita relay aberto). Hoje existe um: `turma1411` (Pão de manhã +
Massas Doces à tarde, 14/11/2026), com dois CTAs de checkout.

### Exemplo (PowerShell)

```powershell
curl.exe -sL -G "https://script.google.com/macros/s/AKfycbxHyN1-ZU49ZH4wU92MHw8PlgLayxVSiszJ7iGG47jdampR5CrTDK2hmo4OH0koPaKRtQ/exec" `
  --data-urlencode "acao=emailteste" `
  --data-urlencode "senha=..." `
  --data-urlencode "para=contato@jonasferrari.com.br" `
  --data-urlencode "modelo=turma1411"
```

## Público e idempotência

- Público = linhas com `status = pago` na aba `Inscritos`, **dedup por e-mail**.
- Cada envio grava uma linha na aba `Emails`:
  `Data | Modelo | Email | Nome | Status` (`enviado`, `teste`, `erro:...`).
- `disparoalunos` pula quem já recebeu aquele modelo (`Status = enviado`).
- Interrupção no meio do lote não repete ninguém: a linha é gravada logo após o envio.
- `dryrun=1` devolve total, já enviados, pendentes, cota do dia e 5 e-mails de amostra.

## Operação

1. `emailteste` para `contato@jonasferrari.com.br` e revisar no Gmail (inclusive spam).
2. `disparoalunos&dryrun=1` para conferir o público.
3. `disparoalunos&limite=40` e repetir no dia seguinte se faltar gente.

CLI: `node tools/enviar-email.mjs teste --para ...` / `node tools/enviar-email.mjs lote --dryrun`
(a senha vem de `PAINEL_SENHA` no ambiente).

## Regras

- **Sem descadastro não sai:** o rodapé traz "responda com sair". Quem responder
  deve ser marcado com `Status = sair` na aba `Emails` e não recebe mais.
- **Uma campanha por modelo.** Criar modelo novo (não reaproveitar o nome) para
  não confundir a deduplicação.
- Preço, data e promessa precisam estar aprovados antes do disparo (`Anuncios/AGENTS.md`).
- O `emailteste` para o próprio dono não exige aprovação; disparo para alunos, sim.

## Arquivos

| Arquivo | Papel |
|---|---|
| `backend/Code.gs` | modelos + envio + público + registro |
| `pdv-clasp/Code.js` | espelho de deploy (cópia exata) |
| `docs/EMAIL.md` | esta spec |
| `tools/enviar-email.mjs` | CLI de teste e lote |
