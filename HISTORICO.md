# HISTORICO.md — Cronologia de decisões (o "porquê")

Histórico das decisões importantes. O git conta o "o quê"; aqui está o "porquê".

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
- Deploy: backend via `clasp` (deploy id fixo, versões @57→@64); frontend via GitHub Pages (git push).

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
