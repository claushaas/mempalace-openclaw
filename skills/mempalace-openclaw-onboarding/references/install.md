# Installation

## What to install

This repository is consumed by OpenClaw through local package installation. The supported host version documented by the repository is `openclaw@2026.4.15`.

The default end-user path is:

1. install the upstream `MemPalace/mempalace` backend;
2. clone this repository into a stable writable directory;
3. run `pnpm setup`;
4. install the local packages required by the chosen mode;
5. copy a versioned example config and edit the placeholders;
6. validate the config before real use.

## Where to clone

Do not clone this repository into:

- `~/.openclaw/`
- `~/.openclaw/workspace/`
- the repository `.tmp/` directory
- ephemeral or aggressively cleaned directories

Use a stable local workspace such as:

- `~/dev/mempalace-openclaw`
- `~/src/mempalace-openclaw`
- another persistent writable path

## Prerequisites

- `Node.js v24.13.1`
- `pnpm 10.33.0`
- `Python 3.9+`

## Install the upstream MemPalace backend

Official upstream:

- `https://github.com/MemPalace/mempalace`
- `https://mempalaceofficial.com/`

Full source install:

```sh
git clone https://github.com/MemPalace/mempalace.git ~/dev/mempalace
cd ~/dev/mempalace
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e .
```

The MCP command expected by this repository is:

```sh
/absolute/path/to/mempalace/.venv/bin/python -m mempalace.mcp_server
```

If the user is developing upstream too, `python -m pip install -e ".[dev]"` is also valid.

Bootstrap:

```sh
git clone https://github.com/claushaas/mempalace-openclaw.git ~/dev/mempalace-openclaw
cd ~/dev/mempalace-openclaw
pnpm setup
```

`pnpm setup` installs dependencies, builds the packages, validates the examples, and prepares temporary operational directories.

## Install repository packages into OpenClaw

Required for any real usage:

```sh
pnpm openclaw:install-local-package -- ./packages/memory-mempalace
```

Recommended default:

```sh
pnpm openclaw:install-local-package -- ./packages/memory-mempalace
pnpm openclaw:install-local-package -- ./packages/context-engine-mempalace
```

Optional operational packages:

```sh
pnpm openclaw:install-local-package -- ./packages/skill-mempalace-sync
pnpm openclaw:install-local-package -- ./packages/mempalace-ingest-hooks
```

What each package is for:

- `memory-mempalace`: required runtime replacement
- `context-engine-mempalace`: recommended pre-reply recall path
- `skill-mempalace-sync`: operational sync commands and root CLI
- `mempalace-ingest-hooks`: hook pack for enqueue-only capture into spool

The repository does not install `active-memory`; that is a bundled OpenClaw plugin when provided by the host version.

## Confirm installation

```sh
pnpm exec openclaw plugins inspect memory-mempalace --json
pnpm exec openclaw plugins inspect claw-context-mempalace --json
pnpm exec openclaw plugins inspect skill-mempalace-sync --json
pnpm exec openclaw hooks list --json
```

Only ask the user to install the packages needed for the chosen mode.
