# Ferramentas — Pão de Verdade

Índice das ferramentas locais (scripts deste repositório). Cada uma deve ter
comando, variáveis de ambiente e o que faz. Segredos nunca entram aqui.

| Ferramenta | Comando | O que faz |
|---|---|---|
| `enviar-email.mjs` | `node tools/enviar-email.mjs teste --para x@y.com` | envia 1 e-mail de um modelo fixo (prova de entrega) |
| `enviar-email.mjs` | `node tools/enviar-email.mjs lote --dryrun` | simula o disparo para os alunos pagos |
| `enviar-email.mjs` | `node tools/enviar-email.mjs lote --limite 40` | dispara até 40 e-mails (máx. 80, teto 90/dia) |

## enviar-email.mjs

- **Env:** `PAINEL_SENHA` (obrigatória) e `WEB_APP_URL` (opcional; já tem default).
- **Modelos:** definidos no backend (`montarEmailModelo`), hoje `turma1411` (Pão de manhã + Massas Doces à tarde).
- **Dry-run:** `--dryrun` no modo `lote` não envia nada.
- **Não imprime a senha** e não grava nada em disco.

```powershell
$env:PAINEL_SENHA = "..."
node tools/enviar-email.mjs teste --para contato@jonasferrari.com.br
node tools/enviar-email.mjs lote --dryrun
```

Doc: `docs/EMAIL.md`.
