# Agente das turmas — ciclo mensal

Camada de conversa em cima da turma sob demanda. Não cria modelo novo de venda:
usa a proposta (`TURMA-SOB-DEMANDA.md`) e a ponte Baileys (`WHATSAPP.md`).
O que o agente acrescenta é **descobrir a data pela disponibilidade das pessoas**,
em vez de o dono escolher a data e tentar encher.

Decidido em 13/11/2026.

## Decisões

| Tema | Decisão |
|---|---|
| Mínimo | **6 pagos** em todos os cursos; teto 10 (coluna `Vagas`). |
| Turmas por mês | **1**. Consequência: proposta que não fecha **não cancela o mês** — rola para a data candidata seguinte com a mesma plateia. |
| Nome | Nenhum. O agente é sempre "o agente do Jonas". Sem persona, sem personagem. |
| Número | **A decidir** — Cloud API exige número dedicado; ver `## Canal`. O da Padaria (99926-5031) fica humano e fora de automação. |
| Prazo | **3 dias antes, 18h** (sábado → quarta 18h; domingo → quinta 18h). |
| Sondagem | Dia 1º do mês. Data alvo = os **últimos fins de semana** do mês (dá o máximo de prazo de venda). |
| Início | **Fevereiro de 2027.** Dezembro e janeiro fora: mês de festa não é teste de máquina. |

## O ciclo

| Quando | O que acontece |
|---|---|
| Dia 1 | Dono marca no painel **quais fins de semana aceita** e o curso de cada um. Fim de semana fora da lista não é sondado. |
| Dia 1–2 | Sondagem por WhatsApp: **uma mensagem por pessoa** (não por lista), com os fins de semana numerados e o curso dela. |
| Dia 6 | Fecha a coleta e cruza. |
| Dia 6–7 | Abre a proposta da data vencedora e convida quem marcou aquela data. |
| +24h | Uma checagem, uma vez (régua abaixo). |
| Prazo | `propostafechar`: confirmada (≥6) ou encerrada. |
| Depois | Confirmada → mensagem 3 do spec. Encerrada → **segunda chamada** (outras listas e ex-alunos de outros cursos) na mesma data, ou rolagem para a data candidata seguinte. |

Sondagem antes do convite é o que substitui "escolher data no achismo". O dono é o
gargalo (dá a aula sozinho), então a agenda dele filtra **antes** de perguntar.

## Formato da sondagem

Botão não serve: são 4–5 fins de semana. Números.

```
Oi, Leandro! Aqui é o agente do Jonas.

Massas Doces, turmas de dezembro. Ele separou estes sábados:
1) 05/12  2) 12/12  3) 19/12  4) 26/12

Quais servem pra você? Responde só com os números (ex: 1 3).
Se nenhum der, responde 0 — e eu não te cobro nada.
A turma fecha com 6 pessoas pagas.
```

- Resposta é só dígitos → parser trivial, sem interpretar texto livre.
- `0` = sai da sondagem **daquele mês**, continua na próxima. Não é descadastro.
- Plano B "responda 1/2" do `WHATSAPP.md` continua valendo nos fluxos com botão
  (convite e confirmação), nunca aqui.

## Cruzamento (a conta)

Para cada `(curso, data)` dos fins de semana marcados pelo dono:

1. conta pessoas disponíveis **naquele curso** (a marcação é por curso, não por pessoa);
2. descarta data que já tem turma do mesmo curso;
3. ordena: `≥ 6` primeiro, depois mais gente, depois data mais cedo;
4. empate → o dono decide no painel (não é o agente).

Vence a primeira. Se nenhuma chega a 6, abre a de **maior contagem** assim mesmo —
proposta aberta é como se busca gente; ela só nasce já sabendo que precisa de
segunda chamada.

## Régua da checagem

Só existe para quem **disse que quer a vaga** e não pagou. Nunca para quem ignorou.

- Dispara **+24h** após o link, ou **na terça**, o que vier antes. Prazo é quarta
  18h: quem clicou no sábado recebe na segunda; quem clicou segunda 22h recebe na
  terça de manhã. Terça é o último dia — não se espera quarta.
- **Uma vez.** Nunca duas seguidas. O aviso final 24h antes do prazo é a única
  outra mensagem.
- Pergunta sobre **problema**, não sobre dinheiro ("conseguiu abrir o link? deu
  algum problema com pix ou cartão?") — e resolve ali: link novo, outro meio ou
  a reserva feita no mesmo dia.

## Estados (por pessoa, dentro da campanha do mês)

```
sondado → disponível(n) → convidado → interessado → pago
      ↘ sem resposta                    ↘ recusou
      ↘ 0 (fora do mês)
```

Proposta: `aberta → confirmada | encerrada` (já no spec). Pessoa que pagou em
proposta encerrada: `credito | estornado` (já no spec).

## Quem fala pelo número

Com o canal na Cloud API (ver `## Canal`), a divisão muda:

- **Toda mensagem para quem não escreveu é template aprovado.** Não existe texto solto
  fora da janela de 24h — e template com quick reply é o que abre a janela.
- **Texto livre só depois que a pessoa responde.** É ali, e só ali, que o agente existe
  de verdade: fora disso ele recita um formulário.
- **Um disparo por dia.** Sondagem e convite nunca no mesmo dia.
- Quem recebeu convite e não respondeu **não entra na sondagem do mês seguinte** sem
  nova interação. Lista cansada vira bloqueio e derruba a qualidade do número.
- `zap-sender.js` sai do caminho crítico — fica como espelho/emergência, não como canal.
- Qualquer reclamação ou dinheiro: o agente **para e chama o Jonas**. Não negocia,
  não estorna, não promete.

## O que falta construir

**F0 — ler resposta (bloqueio).** `bridge/ler.js` existe, está fora do git e não foi
validado. Até isso funcionar, sondagem não existe: um agente que só envia é
megafone. Candidato ao `Bad MAC` descrito no `WHATSAPP.md` (item 3).

Referências já existentes na máquina (ver `## Travas emprestadas`): a extensão
Mettri resolveu a **leitura** lendo o modelo do chat aberto por dentro do WhatsApp
Web (`world: MAIN`, SDK Sierra), e **deixou o envio de fora** justamente porque
`sendText` não é idempotente. As regras de ritmo e trava da Mettri são portáveis;
o código de UI não é. A pesquisa de 13/11 (`## Canal`) concluiu que ler por dentro
também não é o caminho: se o número for da Cloud API, a leitura vem por webhook.

**F1 — boas-vindas da lista (pronto em 16/11).** Texto `boasvindas` em
`bridge/mensagens.js`, envio incremental pelo próprio `zap-sender.js`
(`--campanha boasvindas` já pega só quem não está na aba `Zaps` dessa campanha) e
timer systemd `bridge/vm/zap-boasvindas.timer` numa VM Oracle Always Free (10 min). Quem já estava na lista foi
semeado com `publico=espera:seed` (script descartável) para não receber "bem-vindo"
retroativo. Risco de ban aqui é baixo: é 1 mensagem, para quem acabou de entregar o
número no site, no volume de quem se inscreve — não é a campanha mensal de 38.

**F1b — janela do dono + disponibilidade.** Aba `Disponibilidade`
(`Pessoa | WhatsApp | Curso | Data | MarcadoEm | Campanha`) e endpoints
`janela` (admin: fins de semana aceitos) e `disponibilidade` (grava a marcação).
Reusa `Pessoas` e `ListaEspera`.

**F2 — sondagem.** Texto novo em `bridge/mensagens.js` (não é oferta: nada de
preço, nada de "poucas vagas") + `?acao=zapfila` com `publico=sondagem`.

**F3 — cruzamento + proposta.** Reusa `propostasalvar` e `propostaconvidar`. A
única peça nova é escolher a data.

**F4 — checagem +24h.** Job que varre `PropostasPessoas` com estado `interessado`
e mais de 24h, respeitando a régua.

## Travas emprestadas da Mettri (`C:\mettri4`)

O "disparador poka-yoke" de lá é um painel de DOM, não um programa — não se transporta
pronto. As **regras puras** sim:

| De | Regra | Serve aqui |
|---|---|---|
| `src/modules/marketing/retomar/rate-limiter.ts` | 120/h, 800/dia, 2–11s entre envios, pausa a cada 10 | teto é muito mais alto que o nosso (~54/dia) — copiar a forma, apertar o número |
| `retomar-send-gate.ts` (`evaluateRetomarSendGate`) | trava fail-closed: contador de ciclo tem de casar com o índice da fila, senão não envia | é a resposta certa para "o script rodou duas vezes e mandou tudo de novo" |
| `retomar-contador.ts` | idempotência chatId→ciclo, persistida | mesma ideia do nosso dedup `campanha+telefone` na aba `Zaps` |
| `avaliar-elegibilidade-de-campanha.ts` | 5 portões antes de enviar (status, modo, audiência, frequência, humano) | vira o portão "essa pessoa pode receber agora?" — cobre a regra do "quem ignorou não recebe o mês seguinte" |
| `webhook-service.ts` | retry 3× com backoff + fila do que falhou | para o registro em `Zaps` quando a rede cai |

Mesmo padrão já escrito em `Anuncios/vendas-site/guia-poka-yoke.md` — ler antes de
portar; não criar um terceiro vocabulário.

## Canal — pesquisa concluída (13/11/2026)

O `Bad MAC` e a leitura de resposta são problema de **canal**, não de código do agente.

**Baileys — não é bug nosso, é a lib.** `latest` é `7.0.0-rc14` (29/07/2026), o v7 nunca
saiu do RC, e o `master` está ~15 semanas à frente do npm; o `7.0.0-rc.2` da bridge é
de ~1 ano atrás. O "resposta não chega" tem issue aberta e sem correção: #2331 — depois
da migração PN→LID, uma fração das mensagens entrantes falha o decrypt e
`messages.upsert` **nunca é emitido**; para o app a mensagem não existe (#1769 é o mesmo
tema, aberta desde 09/2025). `fetchMessageHistory` também está quebrado no publicado
(#2853 aberto; o servidor descarta o pedido sem `privacy_sensitive`) — ou seja, o
`ler.js` atual ataca um caminho que upstream não consertou.

**Passkey — a sessão virou ativo insubstituível.** Vincular dispositivo novo agora exige
passkey e o Baileys não implementa (#2672, #2886; PRs #2689/#2696 fechados).
"Não apague `baileys_auth/`" deixou de ser zelo e virou regra.

**Cloud API — o que decide.** Cobrança por mensagem desde 01/07/2025; desde 01/10/2026
*service* é cobrado com **1.000 grátis/mês por número**. Brasil: ~US$ 0,0068
utility/service (~R$ 0,035) e ~US$ 0,0625 marketing (~R$ 0,32 — **não verificado** no
rate card em BRL). Nosso volume: 150 marketing/mês ≈ **R$ 48/mês**. Irrelevante.

**O detalhe que faz o desenho inteiro funcionar:** botão livre só existe dentro da
janela de 24h, mas **template aceita quick reply** (até 10) e o toque chega como
mensagem do usuário — o que abre a janela e libera texto livre. É o "responda 1/2" que
já usamos, com garantia de chegada.

**A consequência de desenho:** fora da janela de 24h o agente **não conversa, recita
template**. Então o objetivo de cada mensagem é gerar resposta; o texto bonito só
existe depois que a pessoa responde.

**Risco de ban no não-oficial:** o gatilho real é **abrir conversa com quem nunca
respondeu** (reachout timelock, #2707/#2441). Responder quem escreveu é o caso seguro.
A sondagem mensal é exatamente "abrir conversa" — não é volume, é a natureza do ato.

**Grupos:** Cloud API só com Official Business Account, 8 participantes, sem botão.
Não serve.

**Conclusão:** número ativo da padaria **nunca** entra em automação. O canal é Cloud API
num número dedicado — e o site já publica dois: **Cursos (34) 93618-6847**
(que é o `PDV_CONFIG.WHATSAPP`) e **Padaria (34) 99926-5031**. Se o de Cursos não for
usado no app por ninguém, ele vira o número da API sem custo novo. **Falta decidir.**

**Armadilha confirmada:** número já em uso no WhatsApp não pode ser registrado na Cloud
API sem ser apagado antes — migrar apaga a conta WhatsApp daquele número e o histórico.
Por isso a decisão não é "qual número é mais bonito", é "qual número pode deixar de
existir como app".

## Continua em aberto

- Se a marcação vale para o curso ou para qualquer curso (hoje: por curso).
- Se a pessoa que marcou duas datas e ganha só uma recebe explicação ou só o
  convite da vencedora.
- Se `0` (nenhum fim de semana) pede motivo — "por que não deu?" é dado de ouro
  para escolher o mês seguinte, mas é mais uma pergunta na cara da pessoa.
