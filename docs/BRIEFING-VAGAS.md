# BRIEFING — Sistema de Vagas + Lista de Espera + Urgência

> Documento auto-suficiente para outro agente executar sem o contexto da conversa.
> Status: **EXECUTADO** (backend @64, commit `8d513dd`). Use como referência de spec/teste.

## Contexto
- Site estático GitHub Pages + backend Google Apps Script + planilha Google + Mercado Pago.
- Projeto: `C:\padaria\site` (git: `ferrarijonas/paodeverdade`, branch `main`).
- Backend FONTE: `backend/Code.gs` → espelho `pdv-clasp/Code.js` → `clasp push --force` (raiz) + `clasp deploy -i AKfycbxHyN1-ZU49ZH4wU92MHw8PlgLayxVSiszJ7iGG47jdampR5CrTDK2hmo4OH0koPaKRtQ`.
- Frontend: `assets/js/checkout.js` (→ `checkout.min.js` via terser), `agenda.html`, `curso-pao.html`, `curso-pizza.html`, `admin.html`, `checkout.html`; config `assets/js/inscricao-config.js` (`PDV_CONFIG`).
- Idempotência pré-existente: LockService + CacheService (claim/resp) + `client_order_id`. Pedido = 1 linha em `Pedidos`; pessoa×curso = 1 linha em `Inscritos`.

## Regras de negócio (VAGAS)
1. Turma = curso + dataTurma. Capacidade = coluna `Vagas` em `Turmas` (default 10).
2. 1 vaga = 1 pessoa × 1 curso numa data (quem compra Pão e Pizza = 2 vagas). Dupla máx = 2 pessoas/pedido.
3. Ocupadas = Inscritos `pago` + `aguardando` com RegistradoEm ≥ agora−30min (janela rolante; reserva libera sozinha se não pagar).
4. Bloqueio em `criarPedido`, DENTRO do LockService, POR CURSO: `ocupadas[curso] + itens[curso] > vagas[curso]` → recusa.
5. Se `restantes == 1` e pedido tem 2+ pessoas no curso → `dupla_nao_cabe`; frontend oferece: (a) 1 pessoa garante; (b) outra data do mesmo curso com ≥2 restantes; (c) lista de espera.
6. Estorno/cancelamento de pago → vaga volta na hora.
7. `?acao=turmas` público (cache 60s) → `[{curso, dataTurma, vagas, ocupadas, restantes, cheia, linkGrupo}]`.

## Backend (implementado em Code.gs)
- `Turmas` += coluna `Vagas` (default 10). Abas novas: `ListaEspera` (Curso, DataTurma, Nome, WhatsApp, Email, CriadoEm, Notificado) e `Logs` (Data, Tipo, Pedido, Detalhe, Extra).
- `contarOcupadas(curso, data)` / `getVagasTurma` / `checarVagas(itens, dataTurma)` / `parseDataRegistro`.
- `criarPedido`: valida pessoas/cursos/cupom ANTES do claim (evita claim preso em pedido inválido); contagem de vagas sob lock separado; `turma_cheia`/`dupla_nao_cabe` com `restantes` e `curso`.
- Endpoints: `turmas`, `listaespera` (dedup por whats/email+curso+data), `listaesperas` (admin), `excluirespera` (admin, por `linha`), `setarvagas` (admin).
- Harness: `log` (beacon front), `logs` (admin), `diagnostico` (admin — saúde), `insights` (admin — funil), `backup` (admin — por venda + manual), `criartriggerbackup` (diário 6h, mantém 30), `telegramtest`.
- `finalizarPedido` dispara (só na 1ª transição): `registrarLog('pago')` + `fazerBackup()` + `notificarVendaTelegram()`.

## Frontend (implementado)
- **agenda.html**: pill de ocupação por curso em cada `[data-turma]` (`7/10` · `Restam 3 🔥` ≤3 · `cheia`); datas sem turma na aba Turmas viram "Em breve — aviso quando abrir" (link desativado) + formulário de espera (nome+whats+email). CTA de espera da seção inferior mantido.
- **curso-pao.html / curso-pizza.html**: selo "Restam X — 29/08" no CTA; se cheia → "Turma esgotada" + link para agenda (lista de espera).
- **checkout.js**: contador ao vivo por curso em `#ckVagasInfo`; bloqueia o envio se `dupla_nao_cabe`/`cheia` (mensagem clara + formulário de espera `#ckEspera`); trata `turma_cheia` vindo do servidor; beacons `?acao=log` (checkout aberto, turma_cheia).
- **admin.html**: turmas com ocupação (`8/10 · 2 restantes` / `cheia`) + botão 🎚 Vagas (`setarvagas`); tabela de lista de espera com 💬 Chamar (wa.me) e 🗑.

## Testes (todos passaram ao vivo)
- 1 pessoa Pão a 8/10 → ok (9/10); replay mesmo cid → MESMO pedido.
- Dupla Pão a 9/10 → `dupla_nao_cabe` com mensagem dos 3 caminhos.
- 1 pessoa Pão a 9/10 → ok (10/10); a 10/10 → `turma_cheia`.
- `setarvagas` ida/volta (12→10); `listaespera` dedup; `listaesperas`/`excluirespera`; `diagnostico`; `insights`; `backup`; `criartriggerbackup` (ok).

## Situação atual (validar com o dono)
- Pão 29/08: 8 pagos (2 restantes) · Pizza 29/08: 2 pagos (8 restantes).
- 31/10 e 28/11 NÃO existem na aba Turmas (aparecem como "Em breve" na agenda) — abrir só criando linha na aba Turmas.
- Backup diário 6h instalado; backups na pasta Drive `Pão de Verdade Backups`.

## Deploy
- Backend: `backend/Code.gs` → `pdv-clasp/Code.js` → clasp push --force → clasp deploy -i <id>.
- Frontend: editar `.js` → gerar `.min.js` (terser) → git commit/push → GitHub Pages (~1min).
