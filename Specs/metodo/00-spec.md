# Método & Receitas — spec de módulo

## Conceito

Esta feature existe para que o aluno, durante a oficina, consiga acompanhar o tempo da massa
sem precisar de relógio próprio nem de lembrar dos marcos sozinho.

O sistema guia o processo da massa em três fases — **dobras**, **modelar** e **frio** — com
avisos no navegador a cada marco. O **método** (o tempo e a contagem das dobras) é **um só**,
compartilhado por todos os cursos. A **receita** (ingredientes e passos de cada curso) é
**conteúdo por curso** e pode variar.

O dono do projeto administra método e receitas pelo **painel**, sem tocar em código.

## Regras de negócio

### Método (compartilhado)

| Se | → Então |
| -- | ------- |
| Método definido com `dobraIntervaloMin`, `totalDobras`, `modelarAposUltimaDobraMin`, `frioAposModelarMin` | A timeline deriva: dobra *n* ocorre em `n × dobraIntervaloMin`; modelar em `totalDobras × dobraIntervaloMin + modelarAposUltimaDobraMin`; frio em `modelar + frioAposModelarMin` |
| Defaults (sem configuração) | `dobraIntervaloMin=15`, `totalDobras=6`, `modelarAposUltimaDobraMin=90`, `frioAposModelarMin=90` → dobras em 15/30/45/60/75/90, modelar em 180, frio em 270 |
| `dobraIntervaloMin` ou `totalDobras` inválido (não é inteiro ≥ 1) | Usa o default |
| Uma receita tem curso próprio e método diferente | Não existe: método é único por deploy, receitas não o sobrescrevem |

### Receitas (por curso)

| Se | → Então |
| -- | ------- |
| Receita criada para um curso | Chave é o nome normalizado (minúsculo, sem acento: `pao`, `pizza`, e qualquer curso novo) |
| Receita com `Ativo` = não | Não é exibida na Área do Estudante, mas permanece no painel para edição |
| `Ingredientes` com várias linhas | Cada linha é um item do checklist |
| Aba `Receitas` vazia (primeiro uso) | É semeada com as receitas padrão de Pão e Pizza |
| Curso sem receita ativa | O bloco "Método no tempo" não é montado para aquele curso |

### Exibição

| Se | → Então |
| -- | ------- |
| Aluno com acesso à Área do Estudante e flag `metodo` ligada | Cada curso com receita ativa mostra um bloco "Método no tempo" independente |
| Estado iniciado | `startAt` salvo; contagem = `Date.now() − startAt` (nunca contador de interval) |
| Marco atingido com a página visível | Beep triplo + banner no bloco |
| Marco atingido com a página em segundo plano | Beep + notificação do navegador (se permitida) + vibração (se suportada) |
| Aluno volta à página depois de marcos perdidos | Alerta de catch-up ("passou da hora: ..."), checkboxes de dobras passadas marcadas, sem spam de notificações |
| Recarregar a página | Estado retomado do `localStorage` por curso |
| Marco de dobra atingido | Checkbox da dobra é marcada automaticamente |
| Tempo total decorrido | Bloco entra no estado "concluído" |

## Interface

### Bloco "Método no tempo" (Área do Estudante)

- Stepper com 3 fases: `1 · Dobras`, `2 · Modelar`, `3 · Frio` — fase atual acesa, concluídas verdes.
- Relógio grande serif com tempo até o próximo marco.
- Linha "Próximo: [fase] em [tempo]".
- Banner de aviso/catch-up (âmbar; vermelho se urgente).
- Checklist de **Ingredientes** (marcável antes de começar).
- Checklist de **Dobras** (1..N) + dica do passo da receita.
- Botões **Começar** (pede permissão de notificação no mesmo gesto) e **Reiniciar**.
- Dois cursos = dois blocos e dois timers independentes (uma chave `pdvMetodo.<curso>` cada).

### Seção "Método & Receitas" (painel)

- **Método**: 4 campos numéricos (intervalo das dobras, total de dobras, minutos após a última dobra para modelar, minutos após modelar para o frio) + **Salvar método**.
- **Receitas**: lista de cursos com rendimento e status; **✏️ Editar** abre modal com rendimento, ingredientes (um por linha), passos de dobra/modelar/frio e checkbox `ativo`; **＋ Adicionar curso** cria receita em branco.

## Escopo fora

- Não cobre avisos por WhatsApp/e-mail nos marcos.
- Não cobre receitas editáveis fora do painel (não há edição pública).
- Não cobre múltiplos métodos simultâneos.
