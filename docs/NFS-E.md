# NFS-e Nacional — Pão de Verdade (spec mestre)

Sistema de emissão automática de **Nota Fiscal de Serviço Eletrônica** (padrão
nacional SEFIN/Receita) para cada vaga paga de oficina (Pão/Pizza). Emite 1 nota
por pessoa pagante, no valor que ela pagou, e envia por e-mail.

## Arquitetura

```
Planilha Google (aba Inscritos/Pedidos)
   │  ?acao=notaspendentes  (fila de pagos sem nota)
   ▼
emissor.py (PC local, certificado A1)
   │  DPS → assinatura XMLDSIG → gzip+b64 → POST mTLS
   ▼
SEFIN Nacional (https://sefin.nfse.gov.br/SefinNacional/nfse)
   │  NFS-e + chave de acesso + XML
   ▼
   ├─ baixar DANFSe (ADN) ou gerar PDF local → enviarnotaemail (backend → Gmail do Jonas)
   └─ marcarnota (coluna Nota na aba Inscritos)
```

## Componentes

| Componente | Onde | Papel |
|---|---|---|
| `backend/Code.gs` | Google Apps Script | fila, numeração, registro, e-mail |
| `emissor.py` | `C:\Padaria\emissor-nfse\` (PC, fora do git) | emissão via SEFIN com certificado A1 |
| `config.json` | junto ao `emissor.py` | segredos + ambiente + alíquota (**não commitar**) |
| Tarefa `EmissorNFSe` | Windows Task Scheduler, diária 06:00 | roda `emissor.py --emitir` |

## Backend (endpoints, todos com `senha`)

| Ação | Função | Descrição |
|---|---|---|
| `notaspendentes` | `notasPendentes()` | fila: inscritos `pago` sem nota. Calcula **valor por vaga = total do pedido ÷ nº pessoas**. Classifica `motivo`: vazio (pronto) · `cpf_invalido` · `pedido_nao_pago` · `valor_zero`. Pula linhas com `emitida:`/`isenta:`/`bloqueado:`; **`erro:` volta pra fila** (retry). |
| `proximonumero` | `proximoNumeroDPS()` | contador atômico (LockService) — fallback de numeração |
| `marcarnota` | `marcarNota(p)` | grava `emitida:CHAVE` / `erro:MSG` / `isenta:MOTIVO`. Nunca sobrescreve `emitida:`/`isenta:` (poka-yoke). |
| `limparnota` | `limparNota(rowId)` | limpa a coluna Nota (reprocessar uma linha) |
| `notaporid` | `notaPorId(rowId)` | retorna dados da linha + chave (usado no `--reenviar`) |
| `enviarnotaemail` | `enviarNotaEmail(b)` (POST) | e-mail com a NFS-e (PDF anexo) pelo GmailApp |

**Coluna `Nota`** (aba Inscritos, coluna 25): `emitida:<chave>` (final) ·
`erro:<msg>` (retry) · `isenta:<motivo>` / `bloqueado:...` (final, exige ação).

## emissor.py (modos)

```
emissor.py                    # dry-run (mostra o plano, emite nada)
emissor.py --emitir           # executa (ambiente do config.json)
emissor.py --emitir --limit 1 # 1 vaga
emissor.py --testa-cpf        # valida CPFs truncados em HOMOLOGAÇÃO
emissor.py --reenviar <rowId> # reenvia a nota de uma vaga já emitida
```

Fluxo por vaga (à prova de erro):
1. `nDPS` **determinístico** = sufixo numérico do `rowId` → reexecutar nunca duplica.
2. `existe_dps(did)` antes de emitir → se já emitida, resgata a chave (idempotência em retries).
3. Emite (3 tentativas com backoff em falha de rede).
4. PDF: tenta o **DANFSe oficial** do ADN; se falhar, **gera localmente** do XML.
5. **Envia e-mail antes de marcar** → se o e-mail falhar, a linha fica pendente e o
   próximo run reenvia (self-healing). Nunca re-emite (item 2).
6. `marcarnota` grava a chave.
7. Falha com `E0207` (CPF inexistente na Receita) → marca `bloqueado` (final, exige
   CPF correto); demais erros → `erro:` (retry).

## Regras de negócio

- **1 vaga = 1 pessoa = 1 NFS-e.** Dupla → 2 notas; cada uma vale `total do pedido ÷ nº pessoas` (descontos duo/cupom já embutidos).
- **Tomador** = aluno (CPF + nome + e-mail). CPF deve **existir na Receita** (o SEFIN rejeita com `E0207`).
- **Serviço**: cTribNac `080201` (item 8.02 LC 116) · NBS `122051900` (1.2205.19.00) · descrição "Oficina de Pão/Pizza - curso presencial".
- **Data de competência** = data da turma. **Local** = Uberlândia (IBGE 3170206).
- **Prestador**: Simples Nacional ME/EPP (`opSimpNac=3`, `regApTribSN=1`), ISS não retido, `pTotTribSN` = alíquota efetiva do DAS (atual **4,00%**, Anexo I Comércio).
- **Numeração oficial** (`nNFSe`) é atribuída pelo SEFIN; lida do XML de retorno e impressa no DANFSe.

## Poka-yoke (camadas)

1. Checkout: máscara 11 dígitos + checagem de dígito verificador (front e `criarPedido`).
2. Fila: `notaspendentes` re-valida CPF e bloqueia os inválidos.
3. Emissão: `existe_dps` impede duplicidade; `nDPS` determinístico.
4. Existência real: o SEFIN (`E0207`) valida contra a Receita — **o checkout só valida os dígitos, não a existência**; por isso CPF fabricado passa no checkout e é pego aqui (fica `bloqueado` e o emissor reporta).
5. E-mail: enviado antes de marcar → falha de e-mail re-tenta no próximo run.

## Recuperação de CPF truncado (10 dígitos)

Se um CPF foi gravado com 10 dígitos e o **10º = DV1 calculado dos 9 primeiros**,
o que falta é o **último DV (11º)** e ele é computável deterministicamente
(`recuperar_cpf` no emissor). **Atenção:** em 2026-08-31 verificamos que todos os
CPFs truncados recuperados **não existem na Receita** (E0207) — ou seja, eram CPFs
fabricados (dígitos válidos, não registrados), não recuperáveis. Regra: recuperar →
`--testa-cpf` confirma existência → só então corrigir via `?acao=atualizar`.

## Alíquota (`p_tot_trib_sn`)

Campo informativo (Lei 12.741). Valor atual: **4,00%** (DAS 07/2026, Anexo I
Comércio, faixa 0–180k). **Atualizar quando a alíquota efetiva do DAS mudar**
(cruza faixa de faturamento de 12 meses). Fonte: PDF do DAS em
`G:\Meu Drive\Comprovantes\<ano>\<mês>\Pro-Labore\Simples Nacional.pdf`.

## Operação

- `testar-dry.bat` — mostra o plano. `rodar-notas.bat` — executa produção.
- Tarefa agendada `EmissorNFSe` — diária 06:00 (alinhada ao backup).
- Log: `emissor-nfse\emissor.log`.
- **Produção**: `config.json` → `"ambiente": "producao"`. Homologação: `"homologacao"`.
- Reprocessar uma linha: corrija o dado → `?acao=limparnota&senha=&rowId=` → rode.

## Troubleshooting

| Situação | Causa | Ação |
|---|---|---|
| `cpf_invalido` na fila | CPF faltando/truncado/fabricado | pedir CPF real ao aluno; `?acao=atualizar&id=&cpf=` |
| `pedido_nao_pago` | inscrito pago sem linha de Pedidos (fluxo antigo) | criar/ajustar pedido na planilha |
| `E0207` | CPF não existe na Receita | corrigir CPF; `limparnota` + `atualizar` |
| e-mail não chega | enviado antes de marcar → fila re-tenta | rodar de novo ou `--reenviar <rowId>` |
| DANFSe oficial fora | ADN instável | fallback local automático (PDF gerado do XML) |

## Crédito de convite (regra, spec do aluno.html)

"Quem usar o seu código ganha 15% de desconto na inscrição. E você ganha 15% de
crédito para o seu próximo curso." → o indicado desconta **15% do bruto**; o
indicador recebe **crédito = 15% do bruto do pedido do indicado** (igual ao desconto
dado). Bug corrigido em 2026-08-31: `creditarReferenciador` rodava fora do guard
`!jaEraPago` (creditava 8× por replay de webhook — crédito inflado) e usava `total`
em vez de `bruto`. Agora credita **só na 1ª transição pra pago** e com `bruto × 0,15`.
