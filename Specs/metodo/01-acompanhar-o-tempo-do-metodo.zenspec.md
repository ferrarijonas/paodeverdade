# Acompanhar o tempo do método (`PDVMetodo`)

Este programa existe para acompanhar o tempo do método durante a oficina,
avisando o aluno a cada marco (dobras → modelar → frio) sem depender de
conhecimento oral ou de relógio externo.

## Conceito

Motor do frontend que roda dentro da Área do Estudante. Recebe um método
(tempos) e uma receita (conteúdo) e transforma em um bloco guiado com
relógio, checklists e avisos. O estado vive no `localStorage` por curso;
a contagem é absoluta (diferença de relógio), então o navegador pode
diminuir o ritmo em segundo plano sem atrasar os marcos.

## Pipeline

```
servidor (acao=metodo)  →  PDVMetodo.montar(el, cursoKey, receita, metodo)  →  bloco guiado na Área do Estudante
```

| Programa | Recebe | Faz | Manda para |
| -------- | ------ | --- | ---------- |
| `PDVMetodo.montar` | `el` (host), `cursoKey`, `receita`, `metodo` | monta o bloco, inicia estado e ticker | avisos (beep/notificação) e DOM |
| `PDVMetodo.nucleo` | `metodo`/`marcos`, `elapsedMin`, `alertados` | cálculos puros de timeline | `montar` (decisões) |

Precondição: receita ativa existe para `cursoKey` e a flag `metodo` está ligada.

## Lógica

### Contrato

`PDVMetodo.montar(el, cursoKey, receita, metodo)` — sem retorno (efeito: DOM).

`PDVMetodo.nucleo.marcos(metodo)` → `{ list, totalMin, dobrasT, modelarT }`

`PDVMetodo.nucleo.proximoMarco(elapsedMin, marcos)` → próximo marco ou `null`

`PDVMetodo.nucleo.perdidos(elapsedMin, alertados, marcos)` → marcos cruzados não avisados

`PDVMetodo.nucleo.faseAt(elapsedMin, marcos)` → `dobras | descanso | modelagem | frio`

`PDVMetodo.nucleo.rotulo(marco)` → texto exibível

### Regras

- `metodo` ausente ou campo inválido (não inteiro ≥ 1) → usa `DEFAULT_METODO` (15/6/90/90).
- Estado inicial: `{ startAt: 0, alertados: {}, dobras: {}, ing: {} }` em `pdvMetodo.<cursoKey>`.
- No primeiro gesto do usuário (`pointerdown`/`keydown`/`touchstart`), o áudio é desbloqueado (`AudioContext.resume`) e as vozes de `speechSynthesis` são carregadas — uma vez por página.
- Ao tocar **Começar**: `startAt = Date.now()`, pede permissão de notificação, ativa o áudio, toca um **som de confirmação** e pede o Screen Wake Lock no mesmo gesto.
- Botão **Testar som e aviso** (poka-yoke): toca alarme + fala + vibração imediatos e mostra feedback (verde "funcionando" / vermelho "navegador bloqueou o som").
- A cada segundo: `elapsedMin = (Date.now() − startAt)/60000`; marcos cruzados e não avisados → avisar e registrar em `alertados`.
- Aviso de marco ao vivo: **alarme sonoro em camadas** (6 beeps alternados 880/660 Hz + varredura 520→1320 Hz) + **fala em pt-BR** do marco (`speechSynthesis`, se disponível) + **overlay de tela cheia** (título serif pulsante + passo da receita + botão "OK, feito"; fecha por toque ou 8s) + banner.
- Aviso de dobra também marca o checkbox daquela dobra.
- Vibração (se suportada) no padrão `[300,100,300,100,500]`; notificação do navegador quando a página está em segundo plano.
- Enquanto o timer roda (`elapsedMin < totalMin`), o Screen Wake Lock mantém a tela acesa; ao concluir ou reiniciar, é liberado.
- Ao voltar à página (`visibilitychange`/`focus`): repete a checagem (catch-up) e re-pede o wake lock se ainda em execução.
- Na montagem com `startAt` existente: catch-up apenas visual (banner), sem som/voz/overlay.
- **Reiniciar**: confirma, limpa a chave do `localStorage`, libera o wake lock, volta ao estado inicial.
- Marcar checkbox de dobra/ingrediente manualmente persiste em `alertados`/`dobras`/`ing`.
- Passo concluído: `elapsedMin ≥ dobrasT` → fase Dobras concluída; `≥ modelarT` → Modelar; `≥ totalMin` → Frio (estado "Pronto").
- O relógio é desenhado com um **anel de progresso** (SVG) proporcional ao tempo total decorrido.

### Edge cases

| Se | → Então |
| -- | ------- |
| `acao=metodo` falhou | Nenhum bloco é montado (host permanece vazio); sem erro visível |
| Notificação não permitida | Aviso fica com alarme + voz + overlay + banner |
| Áudio bloqueado | Alarme e fala silenciados, aviso visual (overlay/banner) mantido |
| `speechSynthesis` indisponível | Só o alarme sonoro + visual |
| Screen Wake Lock indisponível/negado | Timer segue normal; tela pode dormir |
| Dois timers disparam no mesmo instante | O último overlay prevalece (único `#pdvAlerta`) |
| Relógio do aparelho alterado (timezone/ajuste manual) | Contagem derivada do relógio local; marcos podem mudar (limite aceito) |
| `localStorage` indisponível/cheio | Timer roda em memória; estado não sobrevive a recarga |

### Critérios de aceitação

- Marcos default: dobras em 15/30/45/60/75/90, modelar em 180, frio em 270.
- Método custom (ex. `totalDobras=4`) gera timeline correspondente.
- Marco cruzado → um único aviso (sem repetir após recarga).
- Catch-up ao voltar: banner + checkboxes, sem notificações em série.
