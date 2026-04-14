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
  - config: `examples/openclaw.config.memory-only.json`
  - foco: runtime replacement básico
- `recommended`
  - config: `examples/openclaw.config.recommended.json`
  - foco: memory plugin + context engine
- `full`
  - config: `examples/openclaw.config.full.json`
  - foco: memory plugin + context engine + Active Memory

O status real de cada modo deve ser consultado em `docs/COMPATIBILITY_MATRIX.md`.

## Documentos Canônicos

- `docs/SPEC.md`
- `docs/REASONING.md`
- `docs/development/ROADMAP.md`

## Documentos Operacionais

- `docs/COMPATIBILITY_MATRIX.md`
- `docs/TEST_STRATEGY.md`

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

## Estado Atual

O repositório ainda está em fase de definição e endurecimento de plano. A compatibilidade host-real deve ser validada cedo, conforme descrito no roadmap.
