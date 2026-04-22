# Validation

## Local checks

For repository-level local validation:

```sh
pnpm setup
pnpm test
pnpm smoke:examples
```

Use `pnpm smoke:examples` when the user wants a light confidence check for examples and config validity without full host-real execution.

## Host-real checks

Canonical recall proof:

```sh
pnpm host-real:recommended-recall
```

Other relevant host-real checks:

- `pnpm host-real:smoke:memory-only`
- `pnpm host-real:smoke:recommended`
- `pnpm host-real:smoke:full`
- `pnpm host-real:skill-mempalace-sync`
- `pnpm host-real:sync-stage6`
- `pnpm host-real:advanced-recall`
- `pnpm host-real:full-recall`

## How to position them

- `recommended-recall` is the canonical proof for observable automatic recall.
- `advanced-recall` validates optional V2 behavior and does not replace the canonical path.
- `full-recall` is informative and must be explained as such when discussing Active Memory.

## Diagnostics

Only bring in diagnostics or benchmarks when the user actually needs performance or behavior analysis:

- `pnpm diagnostic:stage7`
- `pnpm benchmark:stage7`

Do not recommend host-real validation as the first step for a user who has not yet passed basic config validation.
