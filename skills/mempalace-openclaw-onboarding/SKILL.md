---
name: mempalace-openclaw-onboarding
description: Use this skill when the user needs to install mempalace-openclaw, configure OpenClaw to use its plugins, choose between memory-only/recommended/full/advanced, operate mempalace-sync, or validate setup, config, recall, and sync behavior for this repository.
---

# MemPalace OpenClaw Onboarding

Use this skill for end-user onboarding of this repository inside OpenClaw.

Treat the repository artifacts as the source of truth:

- `README.md`
- `examples/openclaw.config.memory-only.json`
- `examples/openclaw.config.recommended.json`
- `examples/openclaw.config.full.json`
- `examples/openclaw.config.advanced.json`

Do not resolve those paths relative to the skill directory. This skill may be copied into a global skills folder.

First locate the repository root in the user's workspace, then read the repo-relative files from there.

Reliable signals for the repo root:

- a `package.json` whose `"name"` is `mempalace-openclaw`
- a `README.md` whose title is `# mempalace-openclaw`
- the presence of `examples/openclaw.config.recommended.json`

Do not invent configuration shapes that are not present in the versioned examples.

## Default behavior

Default to the `recommended` mode unless the user clearly needs something else.

Only suggest:

- `memory-only` for runtime smoke or minimal replacement use;
- `full` when the user explicitly wants Active Memory and accepts that it remains `partially_validated`;
- `advanced` when the user explicitly wants optional V2 features such as `Knowledge Graph`, `pinned memory`, `query expansion`, `agent diaries`, or transient `compaction`.

Never present hooks as the primary recall mechanism. Hooks are operational ingestion helpers, not the canonical recall path.

## Workflow

1. Determine whether the user needs installation, configuration, operational usage, validation, or troubleshooting.
2. Start from the versioned examples and commands already shipped by the repository.
3. Recommend the minimum package set needed for the chosen mode.
4. Explain required edits concretely:
   - backend `command` / `args` / `cwd`
   - local `path`
   - `include` / `exclude`
   - `schedule`
5. Tell the user how to validate before real use.
6. When sync is involved, explain both the daemon CLI and the `mempalace-sync` OpenClaw command surface.

## Read the right reference

- For clone location, prerequisites, `pnpm setup`, and local package install:
  - [references/install.md](references/install.md)
- For editing config files and using the examples safely:
  - [references/configuration.md](references/configuration.md)
- For choosing between `memory-only`, `recommended`, `full`, and `advanced`:
  - [references/modes.md](references/modes.md)
- For `mempalace-sync`, `skill-mempalace-sync`, and command usage:
  - [references/commands.md](references/commands.md)
- For local checks, `smoke:examples`, and host-real validation:
  - [references/validation.md](references/validation.md)
- For common mistakes and failure cases:
  - [references/troubleshooting.md](references/troubleshooting.md)

## Response discipline

- Be explicit about what is required versus optional.
- Prefer the smallest working setup.
- Separate facts from assumptions when local environment details are missing.
- If the user asks for “all features”, still explain that the canonical starting point is `recommended`, then layer optional pieces on top.
- If `full` or `advanced` is suggested, explain the trade-off immediately instead of burying it later.
- Distinguish clearly between:
  - repository plugins such as `memory-mempalace`, `claw-context-mempalace`, `skill-mempalace-sync`, and `mempalace-ingest-hooks`;
  - this onboarding skill, which only teaches the agent how to use the repository.
