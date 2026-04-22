# Commands and Operational Usage

## Sync surfaces

There are two supported operational surfaces for sync:

- the daemon binary
- the OpenClaw plugin command surface provided by `skill-mempalace-sync`

Explain both when useful, but prefer the OpenClaw command surface when the user already installed the plugin.

## Daemon CLI

Direct daemon usage:

```sh
OPENCLAW_CONFIG_PATH=./openclaw.local.json \
pnpm --filter @mempalace-openclaw/sync-daemon exec mempalace-sync-daemon add-source \
  --config ./repo-source.local.json \
  --json

OPENCLAW_CONFIG_PATH=./openclaw.local.json \
pnpm --filter @mempalace-openclaw/sync-daemon exec mempalace-sync-daemon run \
  --source-id repo-main \
  --json

OPENCLAW_CONFIG_PATH=./openclaw.local.json \
pnpm --filter @mempalace-openclaw/sync-daemon exec mempalace-sync-daemon status \
  --json
```

## OpenClaw command surface

Public commands exposed by `skill-mempalace-sync`:

- `mempalace_sync_add_source`
- `mempalace_sync_list_sources`
- `mempalace_sync_run`
- `mempalace_sync_status`
- `mempalace_sync_remove_source`
- `mempalace_sync_reindex`

Root CLI:

```sh
pnpm exec openclaw mempalace-sync list-sources --json
pnpm exec openclaw mempalace-sync run --source-id repo-main --json
pnpm exec openclaw mempalace-sync status --json
```

## Typical end-user flow

1. Install `skill-mempalace-sync`.
2. Copy a source example and edit `path`, `include`, `exclude`, `schedule`, and defaults.
3. Add the source.
4. Run sync.
5. Inspect status.
6. Reindex with `force` only when needed.

## Hooks

Explain hooks carefully:

- `mempalace-ingest-hooks` is an operational ingestion helper;
- it captures and enqueues into spool;
- it is not the canonical automatic recall path;
- the `sync-daemon` is the owner of spool execution.
