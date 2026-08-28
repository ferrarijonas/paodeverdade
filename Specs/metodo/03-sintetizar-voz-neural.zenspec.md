# Sintetizar a voz neural do método (`ttsSintetizar`)

Este programa existe para sintetizar a fala do método em voz neural
(pt-BR), deixando o aviso com o tom da marca em vez da voz do sistema.

## Conceito

Proxy fino no Apps Script para o Google Cloud Text-to-Speech. Recebe um
texto curto, chama a API com a **voz masculina `pt-BR-Wavenet-B`** (tom
grave e firme, sóbrio), devolve o MP3 em base64 e guarda em cache — o
front toca e só cai para a voz local do navegador se este programa falhar.

## Pipeline

```
metodo.js  →  doGet (acao=tts)  →  Google Cloud TTS  →  { ok, audio(base64) }
```

| Programa | Recebe | Faz | Manda para |
| -------- | ------ | --- | ---------- |
| `ttsSintetizar` | `texto` (+ `callback` opcional) | sanitiza, chama a API, cacheia | `{ ok, audio }` |
| `acao=tts` | `texto`, `callback` | responde JSONP do resultado | `metodo.js` |
| `lerMetodoPublico` | — | expõe `tts: true/false` (se a chave existe) | `aluno.html` (decide usar TTS) |

## Lógica

### Contrato

`acao=tts&texto&callback` → `{ ok: true, audio: "<base64 mp3>" }` ou `{ ok: false, erro }`

Erros:

- sem `GOOGLE_TTS_KEY` → `{ ok: false, erro: 'TTS não configurado (GOOGLE_TTS_KEY).' }`
- `texto` vazio → `{ ok: false, erro: 'Texto vazio.' }`
- resposta da API ≥ 400 → `{ ok: false, erro: 'Falha no TTS (código).' }`
- resposta sem `audioContent` → `{ ok: false, erro: 'Sem áudio na resposta do TTS.' }`

### Regras

- `texto` é sanitizado (trim) e limitado a 220 caracteres.
- Voz: `TTS_VOICE` se configurado, senão `pt-BR-Wavenet-B` (**masculina, firme e séria**).
- Tom: `TTS_PITCH` (default **-3**, grave) e `TTS_RATE` (default **0.95**, ritmo contido); encoding MP3.
- O áudio é cacheado por texto (hash SHA-256, chave `tts:<hash>`), TTL 6h.
- `acao=metodo` expõe `tts` (chave configurada?) para o front decidir entre TTS neural e voz local sem chamada extra.
- `GOOGLE_TTS_KEY`, `TTS_VOICE`, `TTS_PITCH` e `TTS_RATE` entram na whitelist do `configurarProp` (definíveis via `?acao=config` com senha).

### Edge cases

| Se | → Então |
| -- | ------- |
| Chave inválida/estourada (quota) | `{ ok: false }` → front cai para voz local |
| Falha de conexão com a API | `{ ok: false, erro: 'Falha de conexão com o TTS.' }` |
| Cache cheio/indisponível | Chama a API normalmente (sem cache) |
| Front sem `tts` (`dadosMetodo.tts` falso) | Não chama `acao=tts`; usa voz local direto |

### Critérios de aceitação

- Com chave configurada, `?acao=tts&texto=Terceira dobra` devolve MP3 base64 audível.
- Sem chave, devolve `{ ok: false }` sem erro de servidor.
- Texto repetido é servido do cache (segunda chamada não bate na API).
