# WhatsApp — avisos de turma (ponte Baileys)

Disparo de mensagens para lista de espera e ex-alunos pelo WhatsApp da própria
Pão de Verdade. Sem API oficial, sem custo por mensagem: um Node local fala com o
WhatsApp Web (Baileys) e puxa a fila do backend Apps Script.

## Arquivos

| Arquivo | Papel |
|---|---|
| `bridge/pair.js` | pareia por QR em `http://localhost:8099` e grava o que chega em `entrada.json` |
| `bridge/zap-sender.js` | modos `fila` (dry-run), `teste` (1 envio) e `send` (lote) |
| `bridge/mensagens.js` | textos por segmento + links de checkout com `utm_source=whatsapp` |
| `bridge/diag.js` | confere `onWhatsApp` e espera o recibo de entrega |
| `bridge/aviso-turma.js` | aviso de **uma turma** (só quem pagou), com texto, `{nome}` e PDF |
| `bridge/baileys_auth/` | sessão (gitignored — **nunca** commitar) |
| backend `?acao=zapfila` / `?acao=zapmarcar` | fila e registro na aba `Zaps` |

## Roteiro

```powershell
cd C:\Padaria\mkt\site\bridge
$env:PAINEL_SENHA = (Get-Content ..\config.local.json | ConvertFrom-Json).PAINEL_SENHA
```

1. **Parear** (uma vez): `node pair.js` → abrir `http://localhost:8099` → WhatsApp
   no celular → Dispositivos conectados → Conectar dispositivo → escanear.
   Status vira `CONECTADO`.
2. **Conferir quem vai receber**: `node zap-sender.js fila --campanha turma1411 --publico espera`
   (imprime a fila, não envia).
3. **Teste para o próprio número**: `node zap-sender.js teste --para 5534999999999 --publico espera`.
   O teste mostra o texto e o JID resolvido.
4. **Lote**: `node zap-sender.js send --campanha turma1411 --publico espera --limite 40 --delay-min 45 --delay-max 90`.
5. **Conferir**: aba `Zaps` (`Data | Campanha | Telefone | Nome | Status | Publico`) —
   `enviado`, `erro:...`. Quem já está `enviado` não recebe de novo.

## Segmentação (`publico`)

| `--publico` | Quem | Texto |
|---|---|---|
| `espera` | aba `ListaEspera` | Pão **e** Massas Doces |
| `pizza` | ex-alunos pagos de Pizza | Pão **e** Massas Doces |
| `pao` | ex-alunos pagos de Pão | **só** Massas Doces (não reoferece o Pão) |
| `ambos` / `todos` | soma dos três | — |

Dedup por telefone na ordem `espera` → `Pão` → `Pizza`: o primeiro segmento vence.
Dedup de envio é por **campanha + telefone** — para reenviar o mesmo texto é
preciso campanha nova (ex.: `turma1411-lembrete`).

## Aviso de uma turma específica (só quem pagou)

`?acao=zapfila` **não serve** para isso: `publicoZap` só conhece `espera`, `pao` e
`pizza`, soma todos os pagos de todos os tempos e não tem Massas Doces. Para avisar
(horário, endereço, grupo, apostila) use a ferramenta:

```powershell
cd C:\Padaria\mkt\site\bridge
node aviso-turma.js --curso "Massas Doces" --data 14/11/2026 --texto aviso.txt --dry-run
node aviso-turma.js --curso "Massas Doces" --data 14/11/2026 --texto aviso.txt --pdf "C:\caminho\apostila.pdf" --parar-ponte
```

| Flag | O que faz |
|---|---|
| `--curso` | filtra o curso (`Pão`, `Massas Doces`, `Pizza`). Omitido = todos |
| `--data` | `dd/mm/aaaa` da turma (obrigatório) |
| `--texto` | arquivo UTF-8 ou o texto direto; `{nome}` vira o primeiro nome |
| `--pdf` | anexa o arquivo como documento (caption = o texto) |
| `--dry-run` | mostra quem vai receber + o texto montado, sem conectar |
| `--parar-ponte` | derruba o `pair.js` antes e religa no fim |
| `--para` / `--nome` | manda só para um número (teste) |
| `--campanha` | troca o nome da campanha (default `aviso-<data>-<curso>`) |

- Lista = `?acao=dados` filtrado por `dataTurma` + `status=pago`, dedup por telefone,
  com `55` na frente quando o número vem sem DDI.
- Sem `--parar-ponte`, o script **recusa** rodar com a ponte de pé (dois sockets
  derrubam a conexão).
- Dedup local em `bridge/enviados-<campanha>.json` (gitignored); reusar a campanha
  não reenvia. Cada envio também grava em `Zaps` via `?acao=zapmarcar` com
  `publico=alunos:<data>:<curso>`.
- Texto de aviso **não é venda**: nada de preço nem "poucas vagas". Os modelos de
  `bridge/mensagens.js` são de oferta e não servem aqui.
- Apostila e link do grupo do texto são os mesmos da área do aluno: `setarturma` e
  `APOSTILA_PADRAO` (ver `site/AGENTS.md`).

## Regras que já custaram caro

- **Só o primeiro nome** na saudação (`Oi, Leandro!`), nunca o nome completo.
- **JID sempre de `onWhatsApp()`**, nunca `telefone@s.whatsapp.net`: o número na
  planilha pode estar com o 9 a mais ou a menos, e o WhatsApp aceita o envio para
  um JID inexistente **sem dar erro** (a mensagem só não chega).
- **Um processo por vez** na mesma sessão. Dois sockets com o mesmo
  `baileys_auth` derrubam a conexão e enchem o log de `Bad MAC`.
- `515` logo depois do pareamento é normal: a sessão precisa reconectar (o
  `pair.js` já faz isso sozinho).
- Pausa de 45–90s + "digitando…" antes de cada envio. 54 mensagens de uma vez é o
  limite prático para não virar spam.

## Botões clicáveis (native flow)

Botões **funcionam** — mas não pelos campos antigos (`buttons`, `sections`), que o
WhatsApp descarta desde 2024 (Baileys removeu o suporte no PR #956). O caminho que
renderiza é `interactiveMessage` + `nativeFlowMessage`, com os nós binários `biz`,
`interactive` e `native_flow` injetados.

Isso vem no pacote **`gifted-btns`** (compatível com Baileys 7.0.0-rc.2+), instalado
em `bridge/`:

```js
const { sendButtons } = require('gifted-btns');
await sendButtons(sock, jid, {
  title: 'Turma de Pizza',
  text: 'Sábado 5/12, 17h às 22h. Fechamos com 6 confirmados.\nVocê quer a vaga?',
  footer: 'Pão de Verdade',
  buttons: [
    { id: 'sim', text: 'Quero a vaga' },
    { id: 'nao', text: 'Agora não' }
  ]
});
```

Testado em 13/11/2026 no número da Pão de Verdade: os dois botões apareceram e o
toque responde com o `id` (`sim` / `nao`).

Regras de uso:

- **Nunca** é caminho único: todo fluxo com botão precisa do "responda 1 ou 2"
  como plano B, porque o suporte pode sumir numa atualização do WhatsApp.
- Botão é conforto, não contrato — pagamento, confirmação de vaga e estorno nunca
  dependem de o botão renderizar.
- Fixar a versão do pacote (`gifted-btns@1.0.2`) e revisar antes de atualizar: ele
  injeta nós binários no protocolo e roda no mesmo processo da sessão.

## Problemas conhecidos (preencher/confirmar)

1. **Ex-alunos de Pizza receberam oferta do Pão.** O texto `alunos:Pizza` oferece
   Pão + Massas. Confirmar a regra correta: _(a completar)_.
2. **Quem já comprou a turma alvo recebe aviso para comprar.** `publicoZap` não
   exclui quem já tem inscrição paga em 14/11: Rodrigo Carvalho e Edilaine Bonfá
   compraram Pão 14/11 e receberam o texto de "ex-aluno de Pão".
3. **`Bad MAC` ao ler mensagens** — o log enche de erro de decriptação e as
   respostas não são lidas com confiança. **Não apague `baileys_auth/` para "limpar
   a sessão"**: desde 2026 o WhatsApp exige passkey para vincular dispositivo novo e o
   Baileys não suporta passkey (PRs fechados) — um repareamento pode simplesmente não
   acontecer e se perde o único canal. Ver `docs/AGENTE-TURMAS.md`.
4. **9 contatos de fora do DDD 34** entraram na lista de espera; curso é
   presencial em Uberlândia.
5. **Encoding**: nunca passa os JSON de mensagem por `Get-Content`/`Set-Content` do
   PowerShell 5.1 — ele lê UTF-8 sem BOM como ANSI e o texto sai dobrado (`VocÃª`,
   `sÃ¡bado`). Foi o que aconteceu na campanha `pizza1411-espera` (17 envios). O
   `enviar.js` agora aborta se o texto tiver mojibake.
6. `entrada.json` e `*.log` guardam dados de contato/QR: ficam fora do git.

## Próximos passos

- Lembrete em 12–13/11 só para quem **não** comprou (campanha `turma1411-lembrete`).
- Filtrar quem já pagou a turma alvo no `publicoZap`.
- Ler e responder as mensagens recebidas (item 3 acima).
