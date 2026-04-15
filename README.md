# mempalace-openclaw

Runtime replacement de memória para OpenClaw usando MemPalace como source of truth durável.

## Objetivo

Este repositório existe para entregar:

- um plugin real de memory slot: `memory-mempalace`
- um plugin real de context engine: `claw-context-mempalace`
- um caminho documentado e, quando suportado, implementado para Active Memory
- ingestão operacional de fontes externas
- recall automático observável em modos suportados

## Modos Operacionais

- `memory-only`
  - config: [examples/openclaw.config.memory-only.json](examples/openclaw.config.memory-only.json)
  - foco: runtime replacement básico
- `recommended`
  - config: [examples/openclaw.config.recommended.json](examples/openclaw.config.recommended.json)
  - foco: memory plugin + context engine
- `full`
  - config: [examples/openclaw.config.full.json](examples/openclaw.config.full.json)
  - foco: memory plugin + context engine + Active Memory

O status real de cada modo deve ser consultado em [docs/COMPATIBILITY_MATRIX.md](docs/COMPATIBILITY_MATRIX.md).

## Arquitetura Resumida

```text
OpenClaw host
  -> plugins.slots.memory = memory-mempalace
    -> MemPalace
  -> plugins.slots.contextEngine = claw-context-mempalace
    -> consulta o runtime de memória
    -> injeta contexto com provenance
  -> plugins.entries.active-memory
    -> recall automático forte quando suportado
  -> hooks
    -> spool local append-only
  -> sync-daemon
    -> processa spool e fontes externas
    -> atualiza MemPalace e dispara refresh
```

Separação de responsabilidades:

- ingestão
  - hooks, spool e sync daemon.
- retrieval
  - `memory-mempalace` consultando o MemPalace.
- context injection
  - `claw-context-mempalace` e, em modo `full`, cooperação com Active Memory.

## Packages Planejados

| Package | Responsabilidade | Status atual |
| --- | --- | --- |
| `memory-mempalace` | plugin real de memory slot e adapter entre OpenClaw e MemPalace | ainda não implementado |
| `context-engine-mempalace` | plugin real de context engine para budget, pruning e injeção com provenance | ainda não implementado |
| `shared` | tipos, schemas e contratos comuns do runtime, hooks e sync | implementado |
| `sync-daemon` | ingestão operacional, `sync.db`, spool e sincronização de fontes externas | ainda não implementado |
| `skill-mempalace-sync` | surface operacional para adicionar, listar, rodar e reindexar sources | ainda não implementado |

## Documentos Canônicos

- [docs/SPEC.md](docs/SPEC.md)
- [docs/REASONING.md](docs/REASONING.md)
- [docs/development/ROADMAP.md](docs/development/ROADMAP.md)

## Documentos Operacionais

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DB_SCHEMA.md](docs/DB_SCHEMA.md)
- [docs/HOOKS.md](docs/HOOKS.md)
- [docs/MEMORY_RUNTIME.md](docs/MEMORY_RUNTIME.md)
- [docs/CONTEXT_ENGINE.md](docs/CONTEXT_ENGINE.md)
- [docs/ACTIVE_MEMORY.md](docs/ACTIVE_MEMORY.md)
- [docs/MEMORY_PROTOCOL.md](docs/MEMORY_PROTOCOL.md)
- [docs/COMPATIBILITY_MATRIX.md](docs/COMPATIBILITY_MATRIX.md)
- [docs/TEST_STRATEGY.md](docs/TEST_STRATEGY.md)

## Bootstrap Local

Pré-requisitos:

- `Node.js v24.13.1`
- `pnpm 10.33.0`

Scripts da raiz:

- `pnpm build`
- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm dev`
- `pnpm validate-config`

Esta Etapa 0 prepara apenas o bootstrap estrutural do monorepo. Os packages funcionais do runtime ainda não existem nesta fase.

## Validação Host-Real

A Etapa 0A já materializa o seam real do host contra `openclaw@2026.4.14`.

Scripts disponíveis:

- `pnpm host-real:bootstrap`
- `pnpm host-real:manifest`
- `pnpm host-real:memory-slot`
- `pnpm host-real:context-slot`
- `pnpm host-real:active-memory`
- `pnpm host-real:all`

Artefatos relevantes:

- probes: `fixtures/host-real/probe-memory-slot`, `fixtures/host-real/probe-context-engine-slot`
- host temporário: `.tmp/openclaw-host/`
- relatórios temporários: `.tmp/host-real-results/`

Limite importante:

- esses probes validam o seam do OpenClaw host;
- eles não contam como implementação de `memory-mempalace` nem de `claw-context-mempalace`.
- em `openclaw@2026.4.14`, um memory slot externo substitui `memory-core`; por isso a árvore `openclaw memory` não serve como prova do seam nessa etapa.

O estado detalhado da compatibilidade está em [docs/COMPATIBILITY_MATRIX.md](docs/COMPATIBILITY_MATRIX.md).

## Estado Atual

O repositório já tem bootstrap do monorepo e validação host-real inicial do seam com OpenClaw.

O que já está fechado:

- host canônico pinado em `openclaw@2026.4.14`
- manifest real aceito pelo host
- slot de memória validado com probe
- slot de context engine validado com probe
- caminho de configuração de Active Memory investigado e classificado
- contratos operacionais documentados por subsistema
- package `@mempalace-openclaw/shared` com schemas, tipos, erros e utilidades canônicas

O que ainda não existe:

- `packages/memory-mempalace`
- `packages/context-engine-mempalace`
- `packages/sync-daemon`
- `packages/skill-mempalace-sync`
- prova observável de recall automático com MemPalace real
