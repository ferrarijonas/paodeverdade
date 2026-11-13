# HISTORICO.md — Cronologia de decisões (o "porquê")

Histórico das decisões importantes. O git conta o "o quê"; aqui está o "porquê".

## 2026-11 (aviso e apostila padrão na área do aluno)
- Apostila e aviso da turma existiam só na aba `Turmas`: célula vazia = aluno sem material. Agora `buscarDetalhesTurma` cai em `APOSTILA_PADRAO`/`AVISO_PADRAO` por curso, então a área nasce completa; endereço e horário ficam no aviso da turma. Só o `LinkGrupo` continua manual.
- Novo `?acao=setarturma` para gravar link/apostila/aviso da turma sem editar a planilha à mão.
- O endereço do site continua 176 (casa verde); o 156 (padaria) foi usado só na turma de 14/11 e a alteração no site foi revertida.

## 2026-08 (sistema de vagas + harness)
- **Vagas 10/turma + urgência + lista de espera** (o pedido do dono):
  - Antes não havia limite: qualquer um comprava mesmo lotado. Agora `criarPedido` bloqueia por curso, dentro de LockService, com reserva de `aguardando` por 30min (janela rolante, sem job de expiração).
  - Dupla não cabe quando `restantes==1`: recusa com 3 caminhos (1 pessoa / outra data com ≥2 / lista de espera).
  - Urgência honesta (números reais): pill na agenda, selo nos cursos, contador no checkout. Turmas só abrem quando criadas na aba Turmas (31/10 e 28/11 ficam como "Em breve").
- **Lista de espera:** aba `ListaEspera` com nome+whats+email (dono vai disparar e-mail depois), dedup por whats/email+curso+data, painel com "💬 Chamar" (wa.me) e exclusão.
- **Bug encontrado e corrigido:** validações pós-claim seguravam o `claim` por 2h → "Pedido em processamento" em retries legítimos. Solução: reordenar `criarPedido` para validar pessoas/cursos/cupom **antes** do claim.
- **Idempotência (anterior):** `CacheService.add` NÃO existe (erro que quebrava o checkout). Solução: LockService + cache `claim`/`resp` + checagem na aba Pedidos (coluna ClientOrderID). Retry com o mesmo `client_order_id` retorna o MESMO pedido.

## 2026-08 (perf/robustez do checkout)
- **Cold start do Apps Script (9–15s):** mitigado com ping de aquecimento na planilha + timeout 25s + fallback WhatsApp; com warm cai para 3–4s.
- Retomar Pix via sessionStorage; polling 5min + botão verificar; cartão volta para confirmação (`back_urls`).
- Imagens WebP (-90% peso) + lazy load.

## Arquitetura
- **3 camadas** (ver AGENTS.md): código no repo; dados na planilha (nuvem); segredos em Script Properties (nunca no git).

## 2026-08-31 (NFS-e nacional + bug do crédito)
- **NFS-e automática (padrão nacional SEFIN):** o dono precisava emitir nota fiscal para todos os pagos. Provamos o caminho de ponta a ponta: certificado A1 + mTLS + XMLDSIG (via lib `brans-nfe`), DPS v1.00, POST em `sefin.nfse.gov.br/SefinNacional/nfse`. Montamos: fila (`notaspendentes`), numeração determinística (nDPS = sufixo do rowId, idempotente), coluna `Nota`, e-mail com PDF (DANFSe oficial ou gerado local), retry, `--testa-cpf`, tarefa Windows `EmissorNFSe` (diária 6h). **Spec: `docs/NFS-E.md`.**
- **Alíquota:** 4,00% (DAS 07/2026, Anexo I Comércio). `p_tot_trib_sn` no config do emissor.
- **6 notas reais emitidas** (Ana Flávia, Rômulo, Bruna, Katia, Daniele, Luis Felipe) + e-mails enviados.
- **9 CPFs fabricados (não recuperáveis):** 16 pagos, 9 com CPF de 10 dígitos. A matemática (DV1) mostrou prefixo válido, mas `--testa-cpf` confirmou `E0207` (não existem na Receita) — ou seja, foram digitados/gerados CPFs com dígitos válidos porém não registrados, na janela de rollout da validação (21-27/08, quando o `validarCPF` ainda não estava no ar). **O checkout valida só os dígitos, não a existência** — a emissão (E0207) é o backstop. Alunos precisam fornecer o CPF real.
- **Bug do crédito de convite corrigido:** `creditarReferenciador` rodava FORA do guard `!jaEraPago` → cada replay de webhook creditava 15% de novo (crédito da Patricia = 35,06 × 8 = 280,48) e usava `total` em vez de `bruto`. Corrigido: só na 1ª transição e `bruto × 0,15` (espelho do desconto dado, spec do aluno.html). Crédito da Patricia resetado para 41,25.
- **Patricia:** inscrito `pago` sem pedido (fluxo antigo de 20/08, sem CPF e pré-aba Pedidos). Sem nota até resolver com o dono.

- Deploy: backend via `clasp` (deploy id fixo, versões @57→@64); frontend via GitHub Pages (git push).

## 2026-09-11 (NFS-e: causa real dos "CPF inválido" = zero inicial)
- **Descoberta:** os 9 "CPFs fabricados" de 31/08 **não eram fabricados** — a coluna CPF da planilha era **numérica**, então CPF que começa com `0` perdia o zero na gravação (`07295357629` → `7295357629`). Todos os 9 são válidos recolocando o zero (`0` + dígitos → dígitos verificadores batem).
- **Por que o `--testa-cpf` deu E0207:** o `recuperar_cpf` assume que falta o **último DV** (10→11), mas faltava o **primeiro dígito**; ele calculava o 11º dígito errado e o SEFIN rejeitava. Diagnóstico anterior ("fabricado") estava errado.
- **Correção de raiz:** `gravarCpfTexto(sheet, linha, col, cpf)` → `setNumberFormat('@')` antes do `setValue`, aplicado em `criarPedido` (Inscritos col 24, Pessoas col 13) e `atualizarInscricao`. Deploy @104.
- **Eliz Maciel de Carvalho:** CPF corrigido para `07295357629`, NFS-e emitida (chave `31702062250330598000155000000000000726094232510805`), e-mail enviado.
- **Os 8 restantes** (`cpf_invalido`) corrigidos com `0` + dígitos e **emitidos** (Leandro, Vinicius, Lara, Marcelo, Michele, Ana Paula, Gisele, Natália) — a Gisele teve o e-mail reenviado (`--reenviar`).
- **Patricia (`pedido_nao_pago`):** pagamento confirmado na API do MP (`payment 174782355494`, approved, R$ 275, CPF 11495454614). O inscrito tinha um valor legado (não-`PED`) na coluna do pedido; novo endpoint `?acao=vincularpedido` cria o Pedido pago e linka. Nota emitida. **Fila de NFS-e = 0** (16/16 oficinas emitidas).
- **Competência x emissão:** as 16 NFS-e ficaram com `dCompet` = **29/08/2026** (data da turma) e `dhEmi` = **11/09/2026**. O emissor usa `dataTurma` como competência, então a nota pertence ao mês do serviço (agosto). Para o Simples: regime de **competência (emissão)** → setembro; regime de **caixa (recebimento)** → agosto.

## Pendências / próximos passos (planejado, não executado)
- **MCP** (acesso direto do agente a Sheets/Drive via OAuth) — opcional, depois.
- **GA4/Meta Pixel** — o dono não pediu ainda; a analítica própria (`?acao=analiticas`) cobre o essencial.
- **Relatório semanal automático por e-mail** — função de insights pronta; falta o trigger/e-mail se o dono quiser.

## 2026-08 (Telegram ativado)
- **Notificação de venda no celular ativa**: bot `@paodeverdade_bot` (nome "Vendas"), `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` gravados nas Script Properties. `?acao=telegramtest` confirmado ok.
- `finalizarPedido` → `notificarVendaTelegram()` manda "💰 Venda confirmada! Pedido … R$ …" com as pessoas no 1º pagamento.
- No iPhone do dono: som de moedas configurado em Ajustes → Telegram → Som; mutar os outros chats para só a venda tocar.

## 2026-08 (analítica light — o "braço")
- **Rastreador próprio `assets/js/analytics.js`** (sem cookies, sem terceiros) em todas as páginas: eventos `view`, `time` (tempo na página, amostras em 30/60/120s + pagehide), `scroll` (25/50/75/90%), `click_pagar` (checkout). Sessão por `sessionStorage` (`pdv_sid`).
- Backend: aba `Analiticas` (Data, Evento, Pagina, Sessao, Valor) + `?acao=analitica` (público, beacon) + `?acao=analiticas&senha=` (agrega: views/sessões/tempo/rolagem por página + funil checkout→pagar→pago + últimas 24h).
- Endpoint `?acao=config&senha=&chave=&valor=` (whitelist) para eu gravar config em Script Properties sem deploy (usado para o token do Telegram).
- Resultado: eu leio `analiticas` e `diagnostico` no início de cada sessão e sugiro melhorias com dados reais.

## 2026-11-05 (e-mail de divulgação)
- **Serviço de e-mail para avisos de turma**, usando o `GmailApp` que já existia (conta `paodeverdadeudi@gmail.com`). Não entrou SMTP nem provedor novo.
- Endpoints `?acao=emailteste` (1 destinatário) e `?acao=disparoespera` (lista de espera, dedup por e-mail, `dryrun`), com **modelos fixos** no backend — sem HTML livre pela URL.
- Aba nova `Emails` (`Data | Modelo | Email | Nome | Status`) garante idempotência: interromper o lote não repete ninguém. Teto de **90/dia** (limite do Gmail comum) e 40 por chamada.
- Spec: `docs/EMAIL.md`; CLI: `tools/enviar-email.mjs`; endpoints listados no `AGENTS.md`.
- Primeiro modelo: `turma1411` (Pão de manhã + Massas Doces à tarde, 14/11/2026), com dois CTAs. Segmentação: `turma1411` para lista de espera e ex-alunos de Pizza; `massas-pao` (só Massas) para ex-alunos de Pão. Aba `Emails` grava a coluna `Publico` (segmento de cada envio).
- **Moldes** dos dois e-mails guardados na aba `Modelos` (`Nome | Assunto | Texto | Html`), com `{saudacao}`; o backend lê a aba antes do código, então editar o molde não exige deploy.

## 2026-11-12 (WhatsApp e turma sob demanda)

- **Disparo por WhatsApp** (ponte Baileys local, `bridge/`): 54 mensagens para lista de espera e ex-alunos do 14/11, mais 17 para a lista de espera de Pizza e 3 personalizadas. Spec e problemas conhecidos em `docs/WHATSAPP.md`.
- **Turma de Pizza em 14/11 não abre**: 5 recusas e 0 confirmações no poll da lista de espera; Alessandro confirmou 2 vagas, insuficiente.
- Corrigido no backend (deploy @127): `reenviar` procurava a primeira inscrição do contato e parava nela — quem tinha tentativa antiga em `aguardando` não conseguia reenviar o acesso mesmo com o pagamento aprovado.
- **Decisão para 2027: turma sob demanda.** Em vez de montar turma e tentar encher, a turma nasce da fila: mínimo de **6 pessoas** e máximo de **10**, sem cobrança antecipada (o dinheiro não é o gargalo). Quem confirma entra na fila; bateu 6, abre a turma e o restante segue vendendo até 10. Referências de mercado: Meetup, Maven (cohort com mínimo), Cozymeal/Obby/ClassBento (aula com mínimo de alunos). Não implementado — avaliar em 2027.
