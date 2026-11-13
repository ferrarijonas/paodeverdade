# Turma sob demanda (mínimo 6, máximo 10)

Spec da virada de modelo: em vez de montar turma e tentar encher, a turma nasce da
fila. Decidido em 12/11/2026 para o ciclo de 2027. Referências de mercado: Meetup
(quórum), Maven (cohort com mínimo), Cozymeal/Obby/ClassBento (mínimo de alunos,
cancelamento e crédito).

## Regra de negócio

- **Proposta** = curso + data + mínimo (6) + prazo (data e hora de fechamento).
- A turma (aba `Turmas`) é criada junto com a proposta — o que muda é o *status*:
  proposta aberta não é turma confirmada.
- **Pagamento na reserva.** Sem pagamento não existe vaga; reserva `aguardando`
  vence em 30 min, como já é hoje.
- Bateu 6 pagos até o prazo → `confirmada`; segue vendendo até 10.
- Não bateu 6 → `encerrada`: quem pagou escolhe **crédito** ou **estorno**.

## Estados

Pessoa (em `PropostasPessoas`):

```
convidado → interessado → pago
                  ↘ recusou
pago (proposta encerrada) → credito | estornado
```

Proposta (em `Propostas`): `aberta` → `confirmada` | `encerrada`.

## Abas novas

| Aba | Colunas |
|---|---|
| `Propostas` | `PropostaID \| Curso \| DataTurma \| Minimo \| Prazo \| Status \| CriadoEm` |
| `PropostasPessoas` | `PropostaID \| Nome \| WhatsApp \| Email \| Estado \| AtualizadoEm` |

Reaproveita: `ListaEspera` (público do convite), `Turmas` (`Vagas`, ocupação),
`Pessoas.Credito` (crédito), `Logs`.

## Endpoints

| Ação | Quem | O que faz |
|---|---|---|
| `proposta` | público | curso, data, mínimo, confirmados, prazo, status (para página e para o bridge) |
| `propostasalvar` | admin | cria/edita proposta e a turma correspondente |
| `propostaconvidar` | admin | dispara os convites para a `ListaEspera` do curso (dedup por WhatsApp) |
| `propostaestado` | admin/bridge | grava `interessado`/`recusou`/`pago` e devolve o link de pagamento |
| `propostafechar` | admin + trigger | confirma (≥ mínimo) ou encerra (< mínimo) |

## Mensagens

| # | Quando | Conteúdo |
|---|---|---|
| 1 | convite | proposta + botões **[Quero a vaga] [Agora não]** |
| 2 | clique em "Quero a vaga" | link de pagamento na hora (automático) |
| 3 | confirmada | horário, endereço, o que levar, grupo, apostila |
| 4 | encerrada | aviso + botões **[Crédito 12 meses] [Estorno]** |

Cadência — o que a referência faz e a gente copia:

- **Sem lembrete de pagamento** (decisão de 13/11). No máximo **um**, um dia depois,
  e só quando o Pix/cartão falhou — nunca dois seguidos.
- **Contador já existe no site**: `assets/js/proximas.js` mostra "X vagas restantes"
  nas páginas de curso; falta só o prazo de fechamento aparecer junto.
- **1 último aviso** 24h antes do prazo.
- **"Agora não" encerra**: a pessoa sai daquela campanha e só recebe a próxima.
- Botão **sempre** com o texto alternativo "ou responda 1 para sim, 2 para não".

## Fechamento automático

Job diário (reaproveita o trigger de backup) e checagem no horário do `Prazo`:

- pagos ≥ `Minimo` → `confirmada`; dispara mensagem 3; as vagas restantes
  continuam na agenda do site.
- pagos < `Minimo` → `encerrada`; dispara mensagem 4; quem escolher crédito ganha
  linha em `Pessoas.Credito`, quem escolher estorno entra na fila manual do
  Mercado Pago (registrado em `Logs`).

## Política de cancelamento (falta publicar no site e no checkout)

Regra que já existe no sistema (feature `cancelamento` ligada):

- até **5 dias** antes da oficina → o valor vira **crédito** para qualquer turma, sem prazo;
- faltando menos de 5 dias → só transferência da vaga para outra pessoa, até 24h antes;
- **compra online tem 7 dias de arrependimento** com estorno integral (CDC art. 49) —
  é lei, não escolha; o crédito é sugestão, não imposição.

Texto curto para as páginas de curso e para o checkout:

> **Cancelamento** — até 5 dias antes, seu valor vira crédito para qualquer turma
> (sem prazo). Depois disso, dá para passar a vaga para outra pessoa até 24h antes.
> Compra online tem 7 dias para desistir com estorno integral.

Falta colocar em: `checkout.html` (perto do bloco de pagamento), `curso-pao.html`,
`curso-pizza.html`, `curso-massas-doces.html` (perto do CTA) e `perguntas.html`
(entrada de FAQ).

**Feito em 13/11/2026** (local, falta deploy): os cinco lugares ganharam o texto, e o
checkout tem **checkbox obrigatório** `#ckAceite` — `Checkout.enviar()` recusa o
pagamento sem ele.

## Fases

**F1 — controle e convite (1 dia de trabalho).** Abas `Propostas` e
`PropostasPessoas`, `proposta` e `propostasalvar`, disparo do convite pelo bridge
com registro de estado. Fechamento **manual** (você decide e roda `propostafechar`).

**F2 — resposta automática.** Bridge lê o toque do botão, chama `propostaestado` e
responde com o link em segundos. Inclui o fallback "responda 1/2".

**F3 — fechamento e dinheiro.** Trigger no prazo, crédito automático em
`Pessoas.Credito`, lista de estornos para processar.

**F4 — página pública da proposta.** `/proposta.html?curso=&data=` com "faltam X
de 6" e prazo — o contador visível é o que faz o Meetup funcionar.

## O que ainda falta decidir

- Data e hora padrão do prazo (sugestão: quarta 18h para turma de sábado).
- Se a proposta encerrada libera a data para outra proposta na mesma semana.
- Se quem já fez o curso entra no convite (hoje, ex-aluno recebe só o cross-sell).
