# DB_SCHEMA.md

## Objetivo

Este documento define o schema operacional de `sync.db`, o banco local usado pelo sync daemon.

Seu papel é detalhar o contrato de persistência derivado de [SPEC.md](SPEC.md) sem confundir esse banco local com o storage durável do MemPalace descrito em [REASONING.md](REASONING.md).

## Banco e Escopo

- engine: SQLite local.
- arquivo canônico: `sync.db`.
- ownership: sync daemon.
- escopo:
  - registrar fontes configuradas;
  - registrar jobs de sincronização;
  - rastrear arquivos já ingeridos;
  - registrar erros de ingestão de forma auditável;
  - registrar refreshes disparados no runtime.
- fora de escopo:
  - storage durável do MemPalace;
  - embeddings, grafos ou summaries persistidos como source of truth.

## Tabela sources

Função no fluxo:

- registrar cada fonte externa ou spool operado pelo sync daemon.

Colunas:

| Coluna | Tipo lógico | Nullable | PK | Índice | Uso |
| --- | --- | --- | --- | --- | --- |
| `id` | string | não | sim | `sources(id)` | identificador estável da fonte |
| `type` | string | não | não | opcional por implementação | tipo da fonte, como `filesystem`, `git`, `spool` |
| `path` | string | não | não | recomendado | caminho local ou referência primária da fonte |
| `config` | text JSON serializado | não | não | não | configuração persistida da fonte |
| `enabled` | boolean | não | não | recomendado | habilita ou desabilita a fonte sem removê-la |

Notas:

- `config` é persistido como JSON serializado para manter rastreabilidade e evitar schema churn precoce.
- `id` deve ser estável entre reinicializações e reprocessamentos.

## Tabela jobs

Função no fluxo:

- representar cada execução de sincronização ou ingestão disparada pelo daemon.

Colunas:

| Coluna | Tipo lógico | Nullable | PK | Índice | Uso |
| --- | --- | --- | --- | --- | --- |
| `id` | string | não | sim | implícito | identificador do job |
| `source_id` | string | não | não | `jobs(source_id, status, started_at)` | referência à fonte processada |
| `status` | string | não | não | `jobs(source_id, status, started_at)` | estado do job |
| `started_at` | datetime ISO 8601 ou epoch | não | não | `jobs(source_id, status, started_at)` | início do processamento |
| `finished_at` | datetime ISO 8601 ou epoch | sim | não | não | término do processamento |

Notas:

- `source_id` referencia `sources.id`.
- `status` deve permitir pelo menos `pending`, `running`, `completed`, `failed`.

## Tabela files

Função no fluxo:

- rastrear artefatos já ingeridos para idempotência, deduplicação e reprocessamento controlado.

Colunas:

| Coluna | Tipo lógico | Nullable | PK | Índice | Uso |
| --- | --- | --- | --- | --- | --- |
| `path` | string | não | sim | `files(path)` | caminho ou referência única do artefato |
| `hash` | string | não | não | `files(hash)` | fingerprint do conteúdo observado |
| `last_ingested_at` | datetime ISO 8601 ou epoch | não | não | recomendado | última ingestão concluída com sucesso |

Notas:

- `path` é a chave primária canônica prevista no spec.
- `hash` permite detectar mudança real de conteúdo sem confiar apenas em `mtime`.

## Tabela errors

Função no fluxo:

- armazenar falhas de ingestão de forma append-only para auditoria e diagnóstico.

Colunas:

| Coluna | Tipo lógico | Nullable | PK | Índice | Uso |
| --- | --- | --- | --- | --- | --- |
| `job_id` | string | não | não | recomendado | associa o erro a um job |
| `error_message` | text | não | não | não | mensagem persistida da falha |

Notas:

- esta tabela é append-only em v1.
- exclusão ou sobrescrita de erros enfraquece auditabilidade e não deve ocorrer.

## Tabela runtime_refresh

Função no fluxo:

- registrar refreshes disparados no runtime após ingestão local ou sync de fontes externas.

Colunas:

| Coluna | Tipo lógico | Nullable | PK | Índice | Uso |
| --- | --- | --- | --- | --- | --- |
| `id` | string | não | sim | implícito | identificador do refresh |
| `reason` | string | não | não | recomendado | causa do refresh, como `post-ingest` ou `manual-reindex` |
| `triggered_at` | datetime ISO 8601 ou epoch | não | não | `runtime_refresh(triggered_at, status)` | momento em que o refresh foi solicitado |
| `completed_at` | datetime ISO 8601 ou epoch | sim | não | não | momento em que o refresh terminou |
| `status` | string | não | não | `runtime_refresh(triggered_at, status)` | estado do refresh |

Notas:

- `status` deve permitir pelo menos `pending`, `running`, `completed`, `failed`.

## Índices e Constraints

Índices mínimos congelados em v1:

- `sources(id)`
- `jobs(source_id, status, started_at)`
- `files(path)`
- `files(hash)`
- `runtime_refresh(triggered_at, status)`

Constraints obrigatórias:

- `sources.id` único.
- `jobs.id` único.
- `files.path` único.
- `runtime_refresh.id` único.
- `jobs.source_id` deve referenciar uma fonte existente por chave lógica.
- `config` de `sources` precisa ser JSON serializado válido antes de persistência.

## Racional de Modelagem

- o banco local existe para coordenação operacional e auditoria, não para substituir MemPalace.
- o schema é deliberadamente pequeno porque o valor principal do sistema está no storage durável e no retrieval composer, não em um ORM complexo.
- `errors` append-only e `runtime_refresh` explícito reduzem ambiguidade durante incidentes.
- `files.hash` e `files.path` permitem idempotência suficiente em v1 sem introduzir dedup opaca.

## v1 obrigatório

- `sync.db` em SQLite local.
- tabelas `sources`, `jobs`, `files`, `errors`, `runtime_refresh`.
- índices mínimos congelados neste documento.
- `sources.config` como JSON serializado.
- `errors` append-only.

## recomendado

- métricas auxiliares de duração por job.
- índices adicionais por `enabled` ou `type` quando a cardinalidade exigir.
- campos auxiliares de provenance por arquivo, sem alterar o núcleo das tabelas.

## v2

- particionamento lógico de filas por tipo de fonte.
- retenção controlada de histórico de jobs.
- campos auxiliares para priorização e backoff.

## não-objetivos

- replicar o schema interno do MemPalace.
- introduzir ORM em v1.
- armazenar summaries como fonte primária de memória.
- tornar `sync.db` uma camada de verdade paralela ao runtime.

## Referências

- [SPEC.md](SPEC.md)
- [REASONING.md](REASONING.md)
- [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md)
- [TEST_STRATEGY.md](TEST_STRATEGY.md)
