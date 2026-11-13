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
`pizza`, soma todos os pagos de todos os tempos e não tem Massas Doces. Para
avisar/instruir uma turma (horário, endereço, grupo, apostila), monte a lista e
envie pela mesma sessão:

1. `?acao=dados&senha=` → filtrar `dataTurma` igual à turma e `status === 'pago'`
   (campos: `nome`, `whatsapp`, `curso`, `dataTurma`, `status`). Dedup por telefone.
2. **Parar o `pair.js`** (ele segura o socket, dois processos derrubam a conexão):
   `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*pair.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`
3. Rodar o script de envio (esqueleto abaixo). Gravar um JSON local dos telefones
   já enviados — `zapmarcar` registra mas **não impede** reenvio.
4. **Religar o `pair.js`**:
   `Start-Process -FilePath cmd -ArgumentList '/c node pair.js >> pair.log 2>&1' -WorkingDirectory C:\Padaria\mkt\site\bridge -WindowStyle Hidden`

```js
const fs = require('fs');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } =
  require('C:/Padaria/mkt/site/bridge/node_modules/@whiskeysockets/baileys');
const pino = require('C:/Padaria/mkt/site/bridge/node_modules/pino');
const AUTH = 'C:/Padaria/mkt/site/bridge/baileys_auth';
const BASE = '<WEB_APP_URL>';
const SENHA = JSON.parse(fs.readFileSync('C:/Padaria/mkt/site/config.local.json', 'utf8')).PAINEL_SENHA;

const sock = makeWASocket({ version: await fetchLatestBaileysVersion().then(v => v.version),
  auth: (await useMultiFileAuthState(AUTH)).state, logger: pino({ level: 'silent' }), markOnlineOnConnect: false });

const [info] = await sock.onWhatsApp('5534999999999@s.whatsapp.net');   // JID sempre daqui
await sock.sendPresenceUpdate('composing', info.jid);
await sock.sendMessage(info.jid, { text: 'Oi, Nome! ...' });
// anexo: document: fs.readFileSync('C:/caminho.pdf'), mimetype: 'application/pdf',
//        fileName: 'Apostila.pdf', caption: '<texto>'   (nunca document: { url: 'C:\...' })
await fetch(BASE + '?' + new URLSearchParams({ acao: 'zapmarcar', senha: SENHA,
  campanha: 'aviso14nov-pao', telefone: '5534999999999', nome: 'Nome',
  status: 'enviado', publico: 'alunos:14/11:pao' }));
```

- `publico` no `zapmarcar` é texto livre → use `alunos:<data>:<curso>` para achar depois.
- Espaçar 4–8s entre envios; um aviso de turma costuma ser 3–10 pessoas.
- Texto de aviso **não é venda**: nada de preço, nada de "poucas vagas". Os modelos de
  `bridge/mensagens.js` são todos de venda e não servem aqui.
- Apostila/link do grupo que vão no texto são os mesmos da área do aluno: ver
  `setarturma` e `APOSTILA_PADRAO` no `site/AGENTS.md`.

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

## Problemas conhecidos (preencher/confirmar)

1. **Ex-alunos de Pizza receberam oferta do Pão.** O texto `alunos:Pizza` oferece
   Pão + Massas. Confirmar a regra correta: _(a completar)_.
2. **Quem já comprou a turma alvo recebe aviso para comprar.** `publicoZap` não
   exclui quem já tem inscrição paga em 14/11: Rodrigo Carvalho e Edilaine Bonfá
   compraram Pão 14/11 e receberam o texto de "ex-aluno de Pão".
3. **`Bad MAC` ao ler mensagens** — o log enche de erro de decriptação e as
   respostas não são lidas com confiança; para ler respostas é preciso parear de
   novo com sessão limpa.
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
