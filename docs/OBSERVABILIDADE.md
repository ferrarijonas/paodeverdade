# Observabilidade — base para todos os projetos

Princípio: **todo acesso e toda ação sensível deixam rastro com nome, hora e sessão.** A aba `Logs` só acrescenta, nunca edita nem apaga. Se o log falhar, a ação continua: `registrarLog` engole o erro.

## Duas camadas que se cruzam

| Camada | Onde | O que guarda | Tem nome? |
|---|---|---|---|
| Ação | aba `Logs` | `Data · Tipo · Pedido · Detalhe · Extra` | sim, no `Extra` |
| Navegação | aba `Analiticas` | `Data · Evento · Pagina · Sessao · Valor` | não, só sessão |

O `sessao` (id aleatório salvo em `sessionStorage.pdv_sid`) aparece nas duas: o navegador manda `&s=` para o backend e `&sessao=` para a analítica. Com isso a ação identificada se junta ao tempo de página e à rolagem daquela visita.

## O que já é registrado

| Tipo | Quando | Extra |
|---|---|---|
| `area` | aluno abre a área | `nome`, `cursos`, `sessao` |
| `apostila` | aluno abre a apostila licenciada | `nome`, `arquivo`, `sessao` |
| `perfil` | aluno responde uma pergunta do perfil | `nome`, `campo`, `valor`, `sessao` |
| `origem` | primeiro acesso da sessão | utm, referrer ou `direto` |
| `dispositivo` | primeiro acesso da sessão | `mobile` / `desktop` |
| `certificado` | aluno emite o certificado | `nome`, `numero` |
| `painel` | painel administrativo aberto | — |
| `erro` | falha em ação de dinheiro/aluno | mensagem |
| `erro_js` | erro de JavaScript na página | página, origem |
| `concluido` | rotina marca turma passada | nomes |
| `backup` | cópia diária da planilha | nome do arquivo |

## Perfil do aluno (zero-party)

Aba `Perfis`: `PessoaID · Nome · Email · FaixaIdade · Experiencia · Objetivo · Origem · ConsentMkt · AtualizadoEm`.

- A área do aluno mostra **duas perguntas por visita**, em botões, com "Agora não". Nunca pede tudo de uma vez.
- `?acao=perfil&token=...&campo=origem|objetivo|idade|exp|mkt&valor=...` grava uma resposta. `valor=-` limpa.
- `?acao=aluno` devolve `perfil.faltando`, que é o que a página usa para escolher as próximas perguntas.
- Nada de CPF, saúde ou renda. Cada resposta vira uma linha `perfil` no log, com nome e sessão.

## Como consultar

- `?acao=logs&senha=...&n=50` — últimos eventos.
- `?acao=timeline&senha=...&nome=Renata` — a vida inteira de uma pessoa, do mais novo para o mais antigo (busca em tipo, pedido, detalhe e extra; aceita e-mail).
- `?acao=analiticas&senha=...` — agregado por página (views, sessões, tempo, rolagem) e funil.
- `?acao=driveler&senha=...&id=<id da planilha>&aba=Logs&ultimas=1` — as últimas linhas cruas.

## Regras para projetos novos

1. **Nunca editar nem apagar linha de log à mão.** Correção é evento novo. A única exclusão é por idade, feita pela rotina de retenção (`limparAntigos`, 24 meses).
2. **Logar identidade em tudo que é privilegiado:** abrir área, baixar material, emitir documento, abrir painel, mexer em dinheiro.
3. **Log nunca derruba a ação.** Sempre dentro de `try/catch`.
4. **Sessão no cliente, id aleatório**, para cruzar com a analítica.
5. **Nunca logar segredo**: senha, token, CPF. Loga o nome e o id do arquivo.
6. **Hora no fuso do script** (`Session.getScriptTimeZone()`), não UTC.
7. **Retenção**: a aba cresce para sempre; o backup diário mantém as últimas 30 cópias. Se um dia passar de ~100 mil linhas, arquivar por ano em aba separada.
