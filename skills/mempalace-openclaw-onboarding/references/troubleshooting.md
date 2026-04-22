# Troubleshooting

## Common mistakes

### Repository cloned into the wrong place

Symptoms:

- confusing paths
- state mixed with repo checkout
- temp staging colliding with working files

Fix:

- move the clone to a stable writable path outside `~/.openclaw/` and outside the repo `.tmp/`.

### Placeholders not replaced

Symptoms:

- `openclaw config validate` fails
- backend process cannot start
- wrong path in `args`, `cwd`, or source `path`

Fix:

- inspect the exact placeholder fields and replace them with local absolute paths or real env values.

### Package not installed in the host

Symptoms:

- `plugin not found`
- slot points to a plugin id the host cannot inspect

Fix:

- install the required local package with `pnpm openclaw:install-local-package -- ...`
- re-run `openclaw plugins inspect ... --json`

### Confusing the onboarding skill with repository plugins

Facts:

- this onboarding skill only teaches the agent;
- it does not provide runtime behavior;
- `memory-mempalace`, `claw-context-mempalace`, `skill-mempalace-sync`, and `mempalace-ingest-hooks` are the actual repository packages.

### `full` assumed to be fully validated

Correct the expectation immediately:

- `full` is supported as a config path;
- the host boots with the documented shape;
- the Active Memory pre-reply path remains `partially_validated`.

### Hooks treated as the main recall path

Correct this explicitly:

- hooks help ingestion;
- they do not replace the `recommended` recall path based on `memory-mempalace` plus `claw-context-mempalace`.
