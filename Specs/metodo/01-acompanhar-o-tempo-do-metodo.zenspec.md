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
- Ao tocar **Começar**: `startAt = Date.now()`, pede permissão de notificação e ativa o áudio no mesmo gesto.
- A cada segundo: `elapsedMin = (Date.now() − startAt)/60000`; marcos cruzados e não avisados → avisar e registrar em `alertados`.
- Aviso de dobra também marca o checkbox daquela dobra.
- Ao voltar à página (`visibilitychange`/`focus`): repete a checagem (catch-up).
- Na montagem com `startAt` existente: catch-up apenas visual (banner), sem beep/notificação.
- **Reiniciar**: confirma, limpa a chave do `localStorage`, volta ao estado inicial.
- Marcar checkbox de dobra/ingrediente manualmente persiste em `alertados`/`dobras`/`ing`.
- Passo concluído: `elapsedMin ≥ dobrasT` → fase Dobras concluída; `≥ modelarT` → Modelar; `≥ totalMin` → Frio (estado "Pronto").

### Edge cases

| Se | → Então |
| -- | ------- |
| `acao=metodo` falhou | Nenhum bloco é montado (host permanece vazio); sem erro visível |
| Notificação não permitida | Aviso fica só com beep + banner |
| Áudio bloqueado | Beep silenciado, aviso visual mantido |
| Relógio do aparelho alterado (timezone/ajuste manual) | Contagem derivada do relógio local; marcos podem mudar (limite aceito) |
| `localStorage` indisponível/cheio | Timer roda em memória; estado não sobrevive a recarga |

### Critérios de aceitação

- Marcos default: dobras em 15/30/45/60/75/90, modelar em 180, frio em 270.
- Método custom (ex. `totalDobras=4`) gera timeline correspondente.
- Marco cruzado → um único aviso (sem repetir após recarga).
- Catch-up ao voltar: banner + checkboxes, sem notificações em série.
