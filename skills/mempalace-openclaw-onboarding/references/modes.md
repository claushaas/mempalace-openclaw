# Operational Modes

## Default recommendation

Recommend `recommended` by default.

Reason:

- it is the canonical path for observable automatic recall;
- it keeps the setup smaller than `full`;
- it is validated end-to-end by the repository harnesses.

## `memory-only`

Use when the user wants:

- the memory runtime replacement only;
- minimal boot or smoke testing;
- no context injection yet.

Do not oversell it:

- it is not the main recall experience of the project.

## `recommended`

Use when the user wants:

- real retrieval plus context injection;
- the canonical setup of this repository;
- the most defensible end-user default.

This is the main recommendation for first-time setup.

## `full`

Use only when the user explicitly wants Active Memory in addition to the repository plugins.

Be explicit:

- the host boots with the supported shape;
- the repository documents this path carefully;
- the Active Memory pre-reply path still remains `partially_validated`.

So `full` is supported, but it is not the safest default for onboarding.

## `advanced`

Use only when the user explicitly needs optional V2 features:

- `Knowledge Graph`
- `pinned memory`
- `query expansion`
- `agent diaries`
- transient `compaction`

Be explicit:

- these features are optional;
- they do not change the baseline v1 runtime contract;
- they can degrade cleanly when backend MCP capabilities are unavailable.

## How to choose quickly

If the user says:

- “I just want to boot the memory replacement” -> `memory-only`
- “I want the real recommended setup” -> `recommended`
- “I want Active Memory too” -> `full`
- “I want KG / diaries / pinned memory / expansion” -> `advanced`

If the user is vague, choose `recommended`.
