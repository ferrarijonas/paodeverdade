# AGENTS.md — Pão de Verdade (protocolo do harness)

Protocolo **obrigatório** para qualquer agente/sessão que opere este projeto. Leia antes de qualquer mudança.

## O que é o projeto
Site estático (GitHub Pages) + backend **Google Apps Script** + planilha Google + **Mercado Pago**.
Venda de vagas em oficinas presenciais de Pão/Pizza (10 vagas/turma), em Uberlândia/MG.

## Arquitetura em 3 camadas (importante!)
| Camada | Onde vive | Fica no git? |
|---|---|---|
| Código (este repo) | `C:\padaria\site` | ✅ sim |
| Dados (planilha) | Drive Google (`SHEET_ID`) | ❌ não (nuvem) |
| Segredos/config | **Script Properties** do Apps Script (`MP_ACCESS_TOKEN`, `PAINEL_SENHA`, `SHEET_ID`, `NOTIFICAR_EMAIL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `WEB_APP_URL`) | ❌ não (nuvem, de propósito) |
| Config pública | `assets/js/inscricao-config.js` (`PDV_CONFIG`: WEB_APP_URL, PIX_KEY, WHATSAPP) | ✅ sim (é público mesmo) |

**Regra:** NUNCA commitar segredo. Dados e chaves vivem na nuvem; mover a pasta não move eles.

## Stack / mapa
- Backend FONTE: `backend/Code.gs` (Apps Script).
- Espelho de deploy: `pdv-clasp/Code.js` (gerado por cópia; `.clasp.json` e `pdv-clasp/` são gitignored).
- Frontend: `index.html`, `curso-pao.html`, `curso-pizza.html`, `agenda.html`, `checkout.html`, `admin.html`, `aluno.html`.
- JS: `assets/js/checkout.js` → min em `checkout.min.js` (regenerar com terser). Páginas usam os `.min.js`.
- Config central: `assets/js/inscricao-config.js` (`PDV_CONFIG`).

## Deploy
1. **Backend:** edite `backend/Code.gs` → copie para `pdv-clasp/Code.js` → `clasp push --force` (rodar na raiz `C:\padaria\site`) → `clasp deploy -i AKfycbxHyN1-ZU49ZH4wU92MHw8PlgLayxVSiszJ7iGG47jdampR5CrTDK2hmo4OH0koPaKRtQ -d "descrição"`.
2. **Frontend:** edite `.js` → gere `.min.js` (terser) → `git add/commit/push origin main` → GitHub Pages (delay ~1 min).

## Como EU (harness) leio os dados — "braço do projeto"
Web App: `https://script.google.com/macros/s/AKfycbxHyN1-ZU49ZH4wU92MHw8PlgLayxVSiszJ7iGG47jdampR5CrTDK2hmo4OH0koPaKRtQ/exec`
Acesso com senha (PAINEL_SENHA). Endpoints (JSONP ok via `&callback=`):
- `?acao=dados&senha=` → inscritos, turmas (com vagas/ocupadas/restantes), pedidos, cupons, listaEspera
- `?acao=diagnostico&senha=` → **saúde do sistema**: resumo, turmas, erros recentes (ler no início da sessão)
- `?acao=logs&senha=&n=` → eventos recentes (Logs)
- `?acao=insights&senha=` → funil/vendas/por curso
- `?acao=turmas` (público, cache 60s) → ocupação
- `?acao=listaespera` (público) · `?acao=logs` · `?acao=backup&senha=` · `?acao=criartriggerbackup&senha=` · `?acao=telegramtest&senha=`

Sempre use `-G --data-urlencode` com curl no PowerShell (a forma inline `?acao=x` falha intermitente). Cuidado com encoding: o PowerShell 5.1 lê `.ps1` sem BOM como ANSI — use "Pao"/"Pizza" sem acento em literais de teste, ou salve com BOM.

## Regras de negócio (VAGAS — vigente)
- **1 vaga = 1 pessoa × 1 curso numa data** (quem faz Pão e Pizza usa 2 vagas). Dupla máx = 2 pessoas/pedido.
- Turma = `curso + dataTurma`. Capacidade = coluna `Vagas` na aba `Turmas` (default 10).
- **Ocupadas = `pago` + `aguardando` com ≤ 30min** (janela rolante; reserva criada no `criarPedido`, libera sozinha se não pagar).
- Bloqueio em `criarPedido`, dentro de LockService (idempotência + vagas): por curso, `ocupadas + itens > vagas` → `turma_cheia`; `restantes==1` + dupla → `dupla_nao_cabe` (mensagem com 3 caminhos).
- `?acao=setarvagas&senha=&curso=&dataTurma=&vagas=` para ajustar.
- Aba `ListaEspera` (curso, dataTurma, nome, whatsapp, email, criadoEm, notificado) + `?acao=listaespera` (dedup por whats/email+curso+data) + `?acao=listaesperas&senha=` + `?acao=excluirespera&senha=&id=`.
- **Idempotência:** `client_order_id` único por tentativa, reutilizado em retries; LockService + CacheService (claim/resp) + checagem na aba Pedidos (coluna ClientOrderID). Validação roda ANTES do claim.

## Convenções
- Backend: padrões existentes — `getSheet`, `normalizarCurso`/`normalizarData`, `formatDate`, `responder(obj, callback)` (JSONP), erros em PT-BR, **sem comentários de código** (apenas blocos `/* --- */` de contexto).
- `finalizarPedido(pedidoId)` = ponto único onde venda vira paga; dispara log + backup por venda + notificação Telegram (só na 1ª transição, guard `jaEraPago`).
- Backup: copia planilha → pasta Drive `Pão de Verdade Backups`, mantém **30** cópias; trigger diário 6h.
- Erros do MP: `Logger.log` sempre; `registrarLog('erro', ...)` para eu ver no `diagnostico`.

## Ritual de início de sessão (obrigatório)
1. `git log --oneline -5` (contexto recente).
2. `?acao=diagnostico&senha=...` (saúde + turmas + erros).
3. Se preciso, `?acao=logs&senha=&n=30`.

## Testes
Sem framework. Scripts temporários em `C:\Users\Alice\AppData\Local\Temp\opencode` (fora do repo). Valide pelo menos: criarpedido dupla bloqueada quando restantes==1, turma_cheia em 10/10, listaespera dedup, replay idempotente.
