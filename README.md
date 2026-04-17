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
- `advanced`
  - config: [examples/openclaw.config.advanced.json](examples/openclaw.config.advanced.json)
  - foco: extensões opcionais de V2, como `Knowledge Graph`, `pinned memory`, `query expansion`, `agent diaries` e `compaction` transitória

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
    -> enqueue-only a partir da Etapa 6
  -> sync-daemon
    -> owner operacional do spool e de `sync.db`
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
| `memory-mempalace` | plugin real de memory slot e adapter entre OpenClaw e MemPalace | implementado |
| `context-engine-mempalace` | plugin real de context engine para budget, pruning e injeção com provenance | implementado |
| `shared` | tipos, schemas e contratos comuns do runtime, hooks e sync | implementado |
| `mempalace-ingest-hooks` | hook pack real para captura e enqueue em spool local | implementado |
| `sync-daemon` | ingestão operacional, `sync.db`, spool e sincronização de fontes externas | implementado |
| `skill-mempalace-sync` | surface operacional para adicionar, listar, rodar e reindexar sources | implementado |

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
- `pnpm diagnostic:stage7`
- `pnpm benchmark:stage7`

O bootstrap do monorepo já está concluído. Nesta altura do roadmap, `shared`, `memory-mempalace`, `context-engine-mempalace`, `mempalace-ingest-hooks`, `sync-daemon` e `skill-mempalace-sync` já existem.

## Validação Host-Real

A Etapa 0A já materializa o seam real do host contra `openclaw@2026.4.14`.

Scripts disponíveis:

- `pnpm host-real:bootstrap`
- `pnpm host-real:manifest`
- `pnpm host-real:memory-slot`
- `pnpm host-real:memory-mempalace`
- `pnpm host-real:mempalace-ingest-hooks`
- `pnpm host-real:context-slot`
- `pnpm host-real:context-engine-mempalace`
- `pnpm host-real:active-memory`
- `pnpm host-real:smoke:memory-only`
- `pnpm host-real:smoke:recommended`
- `pnpm host-real:smoke:full`
- `pnpm host-real:advanced-recall`
- `pnpm host-real:recommended-recall`
- `pnpm host-real:full-recall`
- `pnpm host-real:skill-mempalace-sync`
- `pnpm host-real:sync-filesystem`
- `pnpm host-real:sync-git`
- `pnpm host-real:sync-spool-cutover`
- `pnpm host-real:sync-stage6`
- `pnpm host-real:all`

Artefatos relevantes:

- probes: `fixtures/host-real/probe-memory-slot`, `fixtures/host-real/probe-context-engine-slot`
- shim MCP local para smoke do backend: `fixtures/host-real/mempalace-mcp-shim.mjs`
- host temporário: `.tmp/openclaw-host/`
- relatórios temporários: `.tmp/host-real-results/`

Limite importante:

- esses probes validam o seam do OpenClaw host;
- eles não contam como implementação de `memory-mempalace` nem de `claw-context-mempalace`.
- em `openclaw@2026.4.14`, um memory slot externo substitui `memory-core`; por isso a árvore `openclaw memory` não serve como prova do seam nessa etapa.

O estado detalhado da compatibilidade está em [docs/COMPATIBILITY_MATRIX.md](docs/COMPATIBILITY_MATRIX.md).

## Estado Atual

O repositório já tem bootstrap do monorepo, runtime de memória funcional, hook pack enqueue-only, `sync-daemon` operacional, skill operacional, context engine funcional com prova observável de recall no modo `recommended`, endurecimento local de ranking/cache/failure modes da Etapa 7 e extensões opcionais de V2 da Etapa 8 preservando o contrato base do runtime.

O que já está fechado:

- host canônico pinado em `openclaw@2026.4.14`
- manifest real aceito pelo host
- slot de memória validado com probe
- plugin final `memory-mempalace` implementado e validado em host real com MCP shim local
- hook pack `mempalace-ingest-hooks` implementado e validado em host real como enqueue-only no spool canônico do host state dir
- slot de context engine validado com probe
- plugin final `claw-context-mempalace` implementado e validado em host real
- `sync-daemon` implementado com `sync.db`, execução de spool, fontes `filesystem`, `git` e `documents`, e refresh operacional
- plugin `skill-mempalace-sync` implementado com os seis comandos públicos e root CLI `mempalace-sync`
- Etapa 6 validada em host real com `host-real:skill-mempalace-sync`, `host-real:sync-filesystem`, `host-real:sync-git`, `host-real:sync-spool-cutover` e `host-real:sync-stage6`
- modo `memory-only` com config real, smoke test e limitação documentada
- modo `recommended` com config real, smoke test e prova observável de recall automático sem skill explícita
- modo `full` com config real, smoke test e classificação precisa como `partially_validated`
- caminho de configuração de Active Memory investigado e classificado
- contratos operacionais documentados por subsistema
- package `@mempalace-openclaw/shared` com schemas, tipos, erros e utilidades canônicas
- ranking explícito `v2`, cache observável em `memory_status` e diagnósticos locais reproduzíveis da Etapa 7
- flags opcionais de V2 em `memory-mempalace` e `claw-context-mempalace`
- `Knowledge Graph` opcional por MCP, com fallback limpo quando as tools não existem
- `pinned memory`, `query expansion`, `agent diaries` e `compaction` transitória validados em `pnpm host-real:advanced-recall`

O que ainda não existe:

- validação positiva do pass próprio de Active Memory antes da resposta principal em `openclaw@2026.4.14`
- fontes `chat-export` no pipeline operacional do `sync-daemon`
- CI/readiness final das etapas posteriores do roadmap

Limites relevantes já observados:

- o harness canônico de aceite da Etapa 5 é `pnpm host-real:recommended-recall`;
- no ambiente linkado do host, o seam público `listActiveMemoryPublicArtifacts(...)` pode não refletir o provider do memory slot final, então o `claw-context-mempalace` usa esse seam como primeira tentativa e cai para o mirror público em disco do `memory-mempalace` quando necessário;
- as extensões avançadas de V2 são todas opcionais e ficam desligadas por default; o runtime base continua funcional sem `Knowledge Graph`, sem diaries e sem compaction;
- em `openclaw@2026.4.14`, o modo `full` inicializa corretamente com `active-memory`, mas o pass pré-resposta próprio do Active Memory ainda não ficou observável com `memory_search` + `memory_get` em transcript. Por isso o status correto continua `partially_validated`.
