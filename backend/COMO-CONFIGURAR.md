# Pão de Verdade — Sistema de Inscrições (Google Apps Script)

## O que esse sistema faz

1. **O aluno clica em "Garantir minha vaga"** no site (páginas de curso ou agenda).
2. Abre um formulário curto (nome, WhatsApp, e-mail).
3. O site envia os dados pro seu Web App (Google Apps Script).
4. O script **cria uma preferência de pagamento personalizada** no Mercado Pago e leva o aluno pro checkout.
5. O aluno paga (Pix ou cartão). O **Mercado Pago avisa o script** (webhook) e o aluno é marcado como **"pago"** na planilha.
6. Quando a turma tiver link de grupo preenchido na planilha, você roda o menu e **todos os pagos recebem o convite por e-mail automaticamente**.
7. Você acompanha tudo no **painel visual** (com senha).

---

## Passo 1 — Criar a planilha

1. Acesse https://sheets.new — crie uma planilha nova.
2. Anote o **ID da planilha** (parte da URL entre `/d/` e `/edit`).

## Passo 2 — Criar o projeto no Apps Script

1. Acesse https://script.google.com
2. Clique em **Novo projeto** (ou "+" → New project).
3. Nomeie o projeto: `Pão de Verdade — Inscrições`.
4. Apague o conteúdo padrão e cole o conteúdo de **`backend/Code.gs`**.
5. Crie um segundo arquivo HTML: clique em **+** ao lado de "Arquivos" → **HTML** → nomeie `painel` e cole o conteúdo de **`backend/painel.html`**.

## Passo 3 — Configurar as propriedades

1. No editor, clique em **Configurações do projeto** (ícone de engrenagem) → **Propriedades do script**.
2. Adicione as 4 propriedades:

| Nome             | Valor |
|------------------|-------|
| `MP_ACCESS_TOKEN` | Seu access token de produção do Mercado Pago (APP_USR-…) |
| `MP_ENVIRONMENT` | `production` ou `sandbox` |
| `MP_TEST_ACCESS_TOKEN` | Access Token de teste, usado quando `MP_ENVIRONMENT=sandbox` |
| `SHEET_ID`        | ID da planilha do Passo 1 |
| `PAINEL_SENHA`    | Uma senha para o painel |
| `WEB_APP_URL`     | Deixe em branco POR ENQUANTO (preenche no Passo 5) |

## Passo 4 — Rodar a criação das abas

1. Selecione a função `criarAbas` no seletor e clique em **Executar**.
2. Autorize o acesso quando pedido (aparece o aviso "Google hasn't verified this app" → **Advanced → Go to ... (unsafe)** — é o seu próprio script).
3. Isso cria as abas **Inscritos** e **Turmas** na planilha.

> **Importante:** na aba **Turmas**, preencha as colunas Curso / DataTurma / LinkGrupo (o link do grupo do WhatsApp de cada turma). Ex.: `Pão | 15/08/2026 | https://chat.whatsapp.com/...`

## Passo 5 — Publicar como Web App

1. Clique em **Implantar → Nova implantação**.
2. Tipo: **Aplicativo da web**.
3. **Executar como:** Eu (seu e-mail).
4. **Quem tem acesso:** Qualquer pessoa.
5. Implante e copie a **URL do Web App** (termina em `/exec`).
6. Volte em **Configurações do projeto → Propriedades do script** e preencha `WEB_APP_URL` com essa URL.

## Passo 6 — Configurar o site

1. Abra `assets/js/inscricao-config.js`.
2. Troque `COLE_AQUI_A_URL_DO_WEB_APP` pela URL do Web App.
3. Commit e push (o deploy do GitHub Pages acontece sozinho).

## Passo 7 — Configurar o webhook do Mercado Pago

O script já envia a URL do web app na criação de cada preferência (`notification_url`), então o aviso de pagamento chega automaticamente. Para garantir:

1. Acesse o painel do Mercado Pago → **Seu negócio** → **Integrações** → **Webhooks** (ou em Configurações).
2. Adicione a URL do Web App como webhook de **Pagamentos**.

## Passo 8 — Usar

**Painel:** acesse `{URL_DO_WEB_APP}?senha=SUA_SENHA`

**Enviar convites:** abra a planilha → menu **Pão de Verdade → Enviar convites de grupos (pagos)**. Ele envia e-mail com o link do grupo para todos os alunos **pagos** das turmas que tiverem link preenchido.

## Área do Aluno

Depois do pagamento aprovado, o sistema gera um link mágico individual e envia por e-mail. O aluno acessa `aluno.html` sem criar senha Google. Na aba `Inscritos`, as colunas `ApostilaURL` e `CertificadoURL` controlam os materiais exibidos; `Concluido` pode ser marcado como `sim` após a oficina.

## Sandbox

Para testar sem dinheiro real, configure `MP_ENVIRONMENT` como `sandbox` e preencha `MP_TEST_ACCESS_TOKEN` com a credencial de teste. Nunca coloque credenciais no site ou no repositório.

---

## Testar (recomendado)

1. Abra o site (local ou publicado), clique em "Garantir minha vaga", preencha o formulário.
2. Você será levado ao checkout do MP (modo sandbox de teste se usar token de teste).
3. Para testar sem pagar: acesse o painel e veja se a linha apareceu como "aguardando".
4. Pague com um cartão de teste do MP (ex.: 5031 4332 1540 6351, vencimento 11/25, CVV 123) e confira se o status virou "pago" e o convite foi enviado.

## Segurança

- O access token fica no **Apps Script** (nunca aparece no site).
- O painel só abre com senha.
- Troque o access token se vazar em algum lugar público.
