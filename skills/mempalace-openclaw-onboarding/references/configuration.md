# Configuration

## Start from versioned examples

Always begin from one of the shipped examples:

- `examples/openclaw.config.memory-only.json`
- `examples/openclaw.config.recommended.json`
- `examples/openclaw.config.full.json`
- `examples/openclaw.config.advanced.json`

Those are repository-relative paths, not paths relative to the installed skill folder.

If needed, locate the repository root first by finding:

- `package.json` with `"name": "mempalace-openclaw"`
- `README.md` with `# mempalace-openclaw`
- `examples/openclaw.config.recommended.json`

Never synthesize a new top-level config shape when the example already exists.

Typical flow:

```sh
cp ./examples/openclaw.config.recommended.json ./openclaw.local.json
```

## Required edits

The `memory-mempalace` backend block usually needs these edits:

- `command`
- `args`
- `cwd`
- sometimes `timeoutMs`

Typical placeholders the user must replace:

- path to the Python interpreter of the virtualenv where `MemPalace/mempalace` was installed
- backend working directory pointing to the local `mempalace` clone

When configuring sync sources, the user must also adjust:

- `path`
- `include`
- `exclude`
- `schedule`
- `defaults.wing`
- `defaults.hall`

The source examples live in:

- `examples/obsidian-source.json`
- `examples/repo-source.json`

## Mode-specific config surfaces

### `memory-only`

Keep:

- `plugins.slots.memory = "memory-mempalace"`
- `plugins.entries.memory-mempalace.enabled = true`

### `recommended`

Keep everything from `memory-only` and add:

- `plugins.slots.contextEngine = "claw-context-mempalace"`
- `plugins.entries.claw-context-mempalace.enabled = true`

### `full`

Keep everything from `recommended` and enable bundled `active-memory`.

Important limitation:

- this mode is supported by the repository config surface, but its dedicated pre-reply path remains `partially_validated`.

### `advanced`

Keep the baseline runtime intact and only enable optional V2 flags when the backend supports them.

## Validation

Validate templates:

```sh
pnpm validate-config
pnpm smoke:examples
```

Validate a local host config:

```sh
OPENCLAW_CONFIG_PATH=./openclaw.local.json \
pnpm exec openclaw config validate --json
```

If a config fails validation, do not hand-wave. Identify the exact wrong field, placeholder, missing plugin install, or path issue.

The canonical backend shape for this repository is:

```json
{
  "plugins": {
    "entries": {
      "memory-mempalace": {
        "enabled": true,
        "config": {
          "transport": "stdio",
          "command": "/absolute/path/to/mempalace/.venv/bin/python",
          "args": ["-m", "mempalace.mcp_server"],
          "cwd": "/absolute/path/to/mempalace",
          "timeoutMs": 5000,
          "defaultTokenBudget": 1200,
          "defaultResultLimit": 8
        }
      }
    }
  }
}
```
