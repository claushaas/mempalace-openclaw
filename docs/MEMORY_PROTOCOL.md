# MEMORY_PROTOCOL.md

## Objetivo

Este documento define a linguagem comum entre os packages planejados do repositório.

Ele descreve contratos lógicos e referencia a implementação concreta já existente em `packages/shared`, mantendo aderência a [SPEC.md](SPEC.md) e [REASONING.md](REASONING.md).

## Entidades do Protocolo

Entidades lógicas mínimas:

- query
  - representa uma consulta ao runtime de memória.
- result
  - representa um item retornado por retrieval.
- artifact
  - representa um item persistido ou recuperável com identidade própria.
- source
  - representa uma origem de ingestão ou storage lógico.
- sync job
  - representa uma execução do sync daemon.
- hook envelope
  - representa um evento capturado e persistido em spool.
- context injection entry
  - representa um item preparado para entrar no prompt.
- runtime health
  - representa status, readiness e sinais operacionais do runtime.

## IDs e Provenance

IDs lógicos mínimos:

- `sourceId`
- `jobId`
- `artifactId`
- `sessionId`
- `agentId`
- `idempotencyKey`

Regras:

- os ids devem ser estáveis o suficiente para auditoria e reprocessamento.
- ids de envelope e de artefato não devem depender apenas de ordem temporal implícita.

Provenance mínima exigida por artefato ou resultado:

- `source`
- `sourceType`
- `sourcePath`
- `updatedAt`
- `classification`

## Envelopes

Envelope lógico mínimo para hooks e integrações internas:

```json
{
  "version": "v1",
  "event": "post-ingest",
  "sessionId": "sess_123",
  "agentId": "agent_main",
  "timestamp": "2026-04-15T12:00:00Z",
  "payload": {},
  "idempotencyKey": "evt_123"
}
```

Regras:

- envelopes devem ser versionados;
- envelopes devem ser auditáveis;
- envelopes devem permitir reprocessamento idempotente.
- `HookEnvelope` é contrato público compartilhado.
- `sourceFingerprint` não faz parte do envelope público; ele pertence ao `SpoolRecord` interno do pipeline de ingestão.

Registro interno mínimo de spool:

```json
{
  "envelope": {},
  "sourceFingerprint": "sha256...",
  "writtenAt": "2026-04-15T12:00:01Z",
  "hookSource": "host-event",
  "processingState": "pending"
}
```

## Fluxo Entre Packages

Fluxo lógico alvo:

```text
hooks
  -> hook envelope
  -> spool record
  -> processor embutido
  -> MemPalace
  -> memory-mempalace
  -> context-engine-mempalace
  -> OpenClaw host
```

Responsabilidades por contrato:

- `shared`
  - materializar tipos, enums e schemas.
- `sync-daemon`
  - operar sobre `source`, `sync job`, `hook envelope`.
- `mempalace-ingest-hooks`
  - operar sobre `hook envelope` e `spool record` para captura e ingestão mínima.
- `memory-mempalace`
  - operar sobre `query`, `result`, `artifact`, `runtime health`.
- `context-engine-mempalace`
  - operar sobre `result` e `context injection entry`.

## Semântica de Estados

Estados mínimos esperados:

- sync job
  - `pending`, `running`, `completed`, `failed`
- runtime refresh
  - `pending`, `running`, `completed`, `failed`
- runtime health
  - `ready`, `degraded`, `unavailable`

Regra:

- estados devem representar condição operacional observável, não suposições otimistas.

## Compatibilidade Futura

- o protocolo deve permanecer pequeno e auditável em v1.
- extensões futuras devem ser adicionadas por compatibilidade incremental, não por reescrita do contrato base.
- o documento continua congelando a semântica lógica; os schemas TypeScript canônicos já vivem em `packages/shared`.

## v1 obrigatório

- entidades lógicas mínimas listadas neste documento.
- ids canônicos.
- provenance mínima preservada.
- envelopes versionados e idempotentes.

## recomendado

- enums explícitos para classificação e status.
- campos auxiliares de score, recency e confidence.
- erros canônicos compartilhados em `shared`.

## v2

- extensões para knowledge graph.
- pinned memory.
- query expansion.
- agent diaries e estados mais ricos.

## não-objetivos

- definir antecipadamente todos os tipos concretos de implementação.
- acoplar o protocolo ao storage interno do MemPalace.
- substituir o spec por um schema excessivamente detalhado nesta etapa.

## Referências

- [SPEC.md](SPEC.md)
- [REASONING.md](REASONING.md)
- [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md)
- [TEST_STRATEGY.md](TEST_STRATEGY.md)
