# Gerenciar método e receitas no painel (`salvarMetodo` / `salvarReceita`)

Este programa existe para gerenciar o método e as receitas da oficina
pelo painel, sem exigir deploy ou edição de código.

## Conceito

Camada de administração: lê e grava o método (tempos compartilhados) e as
receitas (por curso) em abas da planilha, valida os dados e os serve para
o público via um endpoint leve com cache. É o único ponto de escrita de
método e receitas.

## Pipeline

```
painel (admin.html)  →  doGet (salvarmetodo / salvarreceita)  →  abas Metodo/Receitas
planilha             →  lerMetodo()/lerReceitas()             →  acao=metodo (público, cache 60s)
```

| Programa | Recebe | Faz | Manda para |
| -------- | ------ | --- | ---------- |
| `salvarMetodo` | senha + 4 tempos | valida e faz upsert das chaves | aba `Metodo` |
| `salvarReceita` | senha + dados do curso | valida e faz upsert da linha | aba `Receitas` |
| `lerMetodo` | — | lê e devolve tempos com default | `acao=metodo` / painel |
| `lerReceitas` | — | lê, separa ingredientes, seed se vazia | `acao=metodo` / painel |
| `acao=metodo` | `callback` (opcional) | responde `{ metodo, receitas }` com cache 60s | frontend público |

## Lógica

### Contrato

`acao=salvarmetodo&senha&dobraIntervaloMin&totalDobras&modelarAposUltimaDobraMin&frioAposModelarMin` → `{ ok }`

`acao=salvarreceita&senha&curso&renda&ingredientes&passoDobra&passoModelar&passoFrio&ativo` → `{ ok }`

`acao=metodo&callback` → `{ ok, metodo, receitas }`

`listarPainelDados()` inclui `metodo` e `receitas` (painel).

Erros:

- `senha ≠ PAINEL_SENHA` → `{ ok: false, erro: 'Senha incorreta.' }`
- `salvarmetodo` com tempo não-inteiro-≥1 → `{ ok: false, erro }` (nenhum valor gravado)
- `salvarreceita` sem `curso` → `{ ok: false, erro: 'Informe o curso.' }`
- `acao=metodo` com `Ativo`=não → receita omitida da resposta pública

### Regras

- Chaves do método: `dobraIntervaloMin`, `totalDobras`, `modelarAposUltimaDobraMin`, `frioAposModelarMin`; valores persistidos como string em `Chave|Valor`.
- `lerMetodo` sem chave ou com valor inválido → default (15/6/90/90).
- `salvarMetodo` grava as 4 chaves; chave ausente/inválida → mantém a atual (não zera).
- `chaveCurso(curso)` normaliza: minúsculo, sem acento (`Pão`→`pao`, `Pizza`→`pizza`, curso novo → nome normalizado).
- `salvarReceita` faz upsert: se já existe linha com a mesma chave de curso, atualiza; senão, acrescenta.
- `Ingredientes` gravados um por linha; `lerReceitas` separa por quebra de linha e remove linhas vazias.
- Aba `Receitas` sem linhas → `lerReceitas` semeia Pão e Pizza padrão antes de responder.
- Ao salvar, o cache de `acao=metodo` é invalidado.

### Edge cases

| Se | → Então |
| -- | ------- |
| Aba `Metodo` não existe | `getSheet` cria com headers; `lerMetodo` devolve defaults |
| Aba `Receitas` não existe | `getSheet` cria com headers; `lerReceitas` semeia padrão |
| Curso repetido em `Receitas` | Atualiza a primeira linha com a mesma chave |
| `ativo` inválido | Considera `sim` |
| Dois admins salvam ao mesmo tempo | Última escrita vence (sem lock — conteúdo, não vaga) |

### Critérios de aceitação

- Salvar método via painel → `acao=metodo` reflete o novo tempo em ≤ 60s (ou na primeira chamada após invalidação).
- Salvar receita → ingredientes aparecem como checklist; `Ativo`=não remove o bloco da Área do Estudante.
- Sem `senha` correta, nenhuma escrita acontece.
