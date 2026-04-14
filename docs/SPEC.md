# MEMPALACE MEMORY PLUGIN FOR OPENCLAW

## SPEC.md — Canonical Specification

---

# 0. PURPOSE

This document defines the **complete architecture, contracts, runtime behavior, and implementation plan** for a memory system that replaces OpenClaw’s native memory runtime with a **MemPalace-backed memory plugin**.

The system must:

- Provide **high-fidelity recall of past conversations**
- Maintain **structured, queryable long-term memory**
- Enable **agent continuity across sessions**
- Support **external knowledge ingestion** (Obsidian, repositories, text corpora)
- Operate **locally, deterministically, and auditable**
- Integrate with OpenClaw through the **official memory slot**
- Support **automatic pre-reply memory recall** through **Active Memory** and/or a **Context Engine**
- Scale with user knowledge without degrading retrieval quality

---

# 1. CORE PRINCIPLE

## 1.1 Source of Truth

| Layer | Responsibility |
|------|----------------|
| MemPalace | Long-term memory (primary source of truth) |
| OpenClaw Memory Plugin | Runtime adapter exposed through the memory slot |
| OpenClaw Context Engine | Context assembly and pre-reply injection policy |
| OpenClaw Active Memory | Optional blocking pre-reply memory sub-agent |
| Hooks | Session capture and ingestion triggers |
| Sync System | External knowledge ingestion |

> **Rule:** OpenClaw does not own durable memory. It consumes durable memory from MemPalace through the active memory plugin and associated runtime surfaces.

---

# 2. SYSTEM OVERVIEW

## 2.1 High-Level Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                         OpenClaw                            │
│                                                             │
│  plugins.slots.memory        → memory-mempalace            │
│  plugins.slots.contextEngine → claw-context-mempalace      │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ memory-mempalace                                      │  │
│  │                                                       │  │
│  │ memory_search  → MemPalace retrieval                  │  │
│  │ memory_get     → MemPalace artifact resolution        │  │
│  │ memory_status  → runtime / source / sync health       │  │
│  │ memory_promote → MemPalace write path                 │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                          ▲                 ▲                │
│                          │                 │                │
│                   Active Memory      Context Engine         │
│                   (pre-reply)        (assembly)             │
│                          ▲                 ▲                │
│                          └────── Hooks / runtime ───────────│
└───────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                         MemPalace                           │
│                                                             │
│  Wings / Rooms / Halls                                      │
│  Drawers (verbatim storage)                                 │
│  Knowledge Graph                                            │
│  Agent Diaries                                              │
│  Search / MCP / Mining                                      │
│                                                             │
└───────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                    mempalace-sync daemon                    │
│                                                             │
│  External Sources                                           │
│  Queue / checkpoints / dedup                                │
│  File watchers / systemd timer / cron trigger               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

# 3. REPOSITORY STRUCTURE

## 3.1 Monorepo Layout

```text
mempalace-openclaw/
│
├── packages/
│   ├── memory-mempalace/          # OpenClaw memory slot plugin
│   ├── context-engine-mempalace/  # Optional context engine plugin
│   ├── skill-mempalace-sync/      # Operational sync tools
│   ├── sync-daemon/               # Background ingestion worker
│   ├── shared/                    # Shared types, schemas, utilities
│
├── infra/
│   ├── systemd/                   # Timers and services
│   ├── cron/                      # Optional cron configs
│
├── docs/
│   ├── SPEC.md
│   ├── REASONING.md
│   ├── ARCHITECTURE.md
│   ├── COMPATIBILITY_MATRIX.md
│   ├── DB_SCHEMA.md
│   ├── HOOKS.md
│   ├── MEMORY_RUNTIME.md
│   ├── CONTEXT_ENGINE.md
│   ├── ACTIVE_MEMORY.md
│   ├── MEMORY_PROTOCOL.md
│   ├── TEST_STRATEGY.md
│
├── examples/
│   ├── obsidian-source.json
│   ├── repo-source.json
│   ├── openclaw.config.memory-only.json
│   ├── openclaw.config.recommended.json
│   ├── openclaw.config.full.json
│
├── scripts/
│   ├── setup.sh
│   ├── dev.sh
│   ├── validate-config.sh
│
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

---

# 4. OFFICIAL OPENCLAW INTEGRATION SURFACES

## 4.1 Required Runtime Surfaces

This repository MUST integrate with OpenClaw through the following official extension surfaces:

1. **Memory slot plugin**  
   This is mandatory. The repository MUST provide a plugin intended to be selected in:

```json
{
  "plugins": {
    "slots": {
      "memory": "memory-mempalace"
    }
  }
}
```

2. **Context engine plugin**  
   Recommended for full automatic pre-reply injection. The repository SHOULD provide a context engine intended to be selected in:

```json
{
  "plugins": {
    "slots": {
      "contextEngine": "claw-context-mempalace"
    }
  }
}
```

3. **Active Memory**  
   The system SHOULD support Active Memory backed by the MemPalace runtime, so that eligible sessions can run a blocking memory pass before the main assistant reply.

4. **Hooks**  
   Hooks MUST be used for capture, flush, enqueue, and ingestion triggers, but MUST NOT be treated as the sole mechanism for pre-reply recall.

---

## 4.2 Architectural Rule

> Hooks feed memory.  
> The memory slot exposes memory.  
> The context engine assembles memory into context.  
> Active Memory performs an optional blocking pre-reply recall pass.

---

## 4.3 Host-Real Compatibility Validation

This repository MUST validate its extension seams against at least one real OpenClaw host version before deep implementation proceeds.

That validation phase MUST:

- pin at least one target OpenClaw version;
- validate the real plugin manifest shape accepted by that version;
- validate real slot loading for `memory-mempalace`;
- validate real slot loading for `claw-context-mempalace`;
- investigate and document the actual Active Memory enablement seam for that version;
- record results in `docs/COMPATIBILITY_MATRIX.md`.

Compatibility MUST NOT be treated as inferred merely from reading documentation or SDK prose.

---

# 5. MEMORY PLUGIN (CORE)

## 5.1 Package

```text
packages/memory-mempalace/
```

## 5.2 Responsibilities

- Implement the **OpenClaw memory slot contract**
- Register the memory runtime and associated memory capabilities
- Delegate durable memory operations to MemPalace
- Expose search, get, status, promotion, and indexing-compatible runtime surfaces
- Support runtime cooperation with Active Memory and the Context Engine

---

## 5.3 Memory Slot Requirement

This plugin is not merely “memory-aware”; it is the **active memory plugin** selected through `plugins.slots.memory`.

This repository MUST NOT describe the plugin as an auxiliary tool beside native memory. It is the replacement runtime for durable memory in OpenClaw.

---

## 5.4 Core Interfaces

### 5.4.1 memory_search

**Input:**
- query
- optional filters (wing, room, hall, source, recency)

**Process:**
1. Normalize query
2. Query MemPalace:
   - semantic retrieval
   - structural filtering
   - optional keyword fallback
3. Rank + deduplicate
4. Return runtime search results
5. Provide structured result metadata for downstream context injection

**Output:**
- relevant memory snippets
- metadata (source, timestamp, wing/room/hall)
- memory IDs / artifact references
- confidence / retrieval reason (optional)

---

### 5.4.2 memory_get

Returns full artifact content or structured resolved content for a given memory ID.

---

### 5.4.3 memory_status

Returns:
- number of memories
- configured sources
- sync health
- ingestion lag
- plugin runtime health
- active context-engine compatibility status
- active-memory compatibility status

---

### 5.4.4 memory_index

Compatibility surface that triggers:
- re-sync,
- re-mining,
- checkpoint refresh,
- local cache refresh.

This is not a no-op. It is a compatibility command mapped to MemPalace refresh behavior.

---

### 5.4.5 memory_promote

Writes structured memory to MemPalace:
- drawer content
- metadata classification
- source attribution
- session provenance
- optional KG enrichment
- optional diary write

---

## 5.5 Retrieval Composer

### REQUIRED

The plugin MUST:

- enforce token budgets
- deduplicate content
- mix:
  - factual memory
  - conversational memory
  - external artifact memory
- rank by:
  - semantic similarity
  - recency
  - source confidence
  - structural match
  - pinned / durable weight (future)
- emit results suitable for:
  - direct search output
  - active-memory reasoning
  - context-engine injection

---

# 6. ACTIVE MEMORY

## 6.1 Role

Active Memory is the preferred mechanism for **automatic pre-reply memory consultation** in eligible conversational sessions.

Where supported and enabled, the MemPalace runtime SHOULD power Active Memory so that the assistant can:

1. inspect the incoming message,
2. perform a blocking recall pass,
3. inject the most relevant retrieved context,
4. only then produce the main reply.

---

## 6.2 Design Goal

The end-user must not need to explicitly call a skill or tool to benefit from memory recall during normal conversation.

---

## 6.3 Responsibility Split

| Surface | Purpose |
|------|---------|
| Memory slot | exposes the durable memory runtime |
| Active Memory | performs automatic pre-reply recall |
| Context Engine | decides how recalled memory is injected and budgeted |
| Hooks | persist and refresh the corpus |

---

## 6.4 Requirement Level

- **SHOULD** support Active Memory in v1 if the SDK/runtime seam is stable enough.
- **MUST** document how to enable Active Memory even if initial implementation lands in v2.
- **MUST NOT** claim that hooks alone provide automatic pre-reply recall.

---

## 6.5 Activation Example

```json
{
  "agents": {
    "defaults": {
      "activeMemory": {
        "enabled": true
      }
    }
  }
}
```

> Exact knobs may evolve with OpenClaw versions. The repository MUST keep an `examples/openclaw.config.example.json` up to date with the currently supported configuration shape.

---

# 7. CONTEXT ENGINE

## 7.1 Role

The context engine controls how OpenClaw assembles model context for each run.

For this project, a MemPalace-aware context engine is strongly recommended because memory retrieval is only useful if the retrieved material is inserted into model context in a disciplined way.

---

## 7.2 Responsibilities

The MemPalace-aware context engine SHOULD:

- ask the memory runtime for relevant recall material
- merge recalled memory into prompt additions
- budget memory snippets against the model token window
- preserve provenance
- avoid context pollution
- prune or compact lower-value retrieved material first
- cooperate with session pruning and older-history compaction

---

## 7.3 Activation Example

```json
{
  "plugins": {
    "slots": {
      "memory": "memory-mempalace",
      "contextEngine": "claw-context-mempalace"
    }
  }
}
```

---

## 7.4 Fallback Strategy

If the custom context engine is not enabled:

- the custom memory slot plugin still works;
- hooks still ingest and refresh memory;
- explicit memory search still works;
- Active Memory may still work if separately wired;
- but **automatic and deterministic pre-reply injection quality will be weaker**.

Therefore:

> The memory plugin is mandatory.  
> The context engine is strongly recommended for full runtime behavior.

---

## 7.5 Operational Modes

The repository MUST explicitly support and document three operational modes:

### 7.5.1 memory-only

- active slot: `plugins.slots.memory = "memory-mempalace"`
- required deliverables:
  - `examples/openclaw.config.memory-only.json`
  - smoke test in a real host
  - documented limitations

### 7.5.2 recommended

- active slots:
  - `plugins.slots.memory = "memory-mempalace"`
  - `plugins.slots.contextEngine = "claw-context-mempalace"`
- required deliverables:
  - `examples/openclaw.config.recommended.json`
  - smoke test in a real host
  - proof that automatic pre-reply recall is observable without explicit skill invocation
  - documented limitations

### 7.5.3 full

- active slots:
  - `plugins.slots.memory = "memory-mempalace"`
  - `plugins.slots.contextEngine = "claw-context-mempalace"`
  - Active Memory enabled for the target host version
- required deliverables:
  - `examples/openclaw.config.full.json`
  - smoke test in a real host
  - proof that automatic pre-reply recall is observable without explicit skill invocation
  - documented limitations

At least one of `recommended` or `full` MUST provide strong automatic pre-reply recall behavior backed by host-real validation.

---

# 8. HOOK SYSTEM

## 8.1 Purpose

Hooks capture and enqueue durable memory updates automatically.

---

## 8.2 Hook Events

| Event | Action |
|------|--------|
| /new | flush session artifact |
| /reset | flush session artifact |
| stop / pre-compact / end-of-session | enqueue capture |
| milestone | promote durable memory |
| scheduled sync event | run external refresh |
| post-ingest event | refresh runtime cache |

---

## 8.3 Flow

```text
Session milestone or session end
    ↓
Hook triggers
    ↓
Session exported / normalized
    ↓
Written to spool
    ↓
Daemon processes
    ↓
MemPalace ingest
    ↓
Runtime cache / metadata refresh
```

---

## 8.4 Rule

Hooks must be **lightweight**.

No heavy retrieval, mining, or classification inline.

---

## 8.5 Non-Goal

Hooks are **not** the primary pre-reply recall mechanism.

---

## 8.6 Observable Recall Requirement

The repository MUST contain at least one automated test or harness that proves, in a supported mode, that:

1. memory was ingested into MemPalace,
2. a subsequent user prompt required that memory,
3. the system recalled that memory before the main response path,
4. no explicit memory skill invocation was required from the user.

This proof MUST be described in `docs/TEST_STRATEGY.md` and linked from `docs/COMPATIBILITY_MATRIX.md`.

---

# 9. SYNC SYSTEM

## 9.1 Package

```text
packages/sync-daemon/
```

## 9.2 Responsibilities

- ingest external content
- monitor changes
- deduplicate
- normalize into MemPalace
- keep the durable corpus fresh enough for runtime recall

## 9.3 Data Sources

| Type | Example |
|------|--------|
| filesystem | Obsidian vault |
| git repo | codebase |
| chat export | Slack, ChatGPT, Claude |
| documents | markdown, txt, notes |

## 9.4 Source Configuration

```json
{
  "id": "obsidian-main",
  "kind": "filesystem",
  "path": "/vault",
  "mode": "notes",
  "schedule": "0 * * * *",
  "include": ["**/*.md"],
  "exclude": [".obsidian/**"],
  "defaults": {
    "wing": "wing_general",
    "hall": "hall_discoveries"
  }
}
```

## 9.5 Processing Pipeline

```text
Detect changes
    ↓
Hash check
    ↓
Chunk
    ↓
Classify (light)
    ↓
Deduplicate
    ↓
Write to MemPalace
    ↓
Refresh runtime metadata
```

## 9.6 Deduplication

- content hash
- semantic similarity threshold
- source fingerprint

---

# 10. SQLITE SCHEMA

## 10.1 sync.db

### tables

#### sources
- id
- type
- path
- config
- enabled

#### jobs
- id
- source_id
- status
- started_at
- finished_at

#### files
- path
- hash
- last_ingested_at

#### errors
- job_id
- error_message

#### runtime_refresh
- id
- reason
- triggered_at
- completed_at
- status

---

# 11. SKILL PLUGIN

## 11.1 Package

```text
packages/skill-mempalace-sync/
```

## 11.2 Commands

### mempalace_sync_add_source
### mempalace_sync_list_sources
### mempalace_sync_run
### mempalace_sync_status
### mempalace_sync_remove_source
### mempalace_sync_reindex

---

# 12. MEMORY MODEL

## 12.1 Structure

```text
Wing → Hall → Room → Closet → Drawer
```

> Note: MemPalace prose sometimes describes rooms/halls in different explanatory order. Runtime implementation must preserve the actual MemPalace taxonomy semantics and not rely on prose shorthand.

## 12.2 Memory Types

| Type | Description |
|------|-------------|
| facts | decisions / durable facts |
| events | sessions / milestones |
| discoveries | insights / breakthroughs |
| preferences | habits / stable preferences |
| advice | recommendations / solutions |

## 12.3 Session Classification (Light)

- decision
- problem
- milestone
- artifact
- conversation

---

# 13. KNOWLEDGE GRAPH (OPTIONAL V2)

- entities
- relationships
- temporal validity

---

# 14. AGENT DIARY (OPTIONAL V2)

Each subagent:

- writes compressed entries
- reads own history
- builds specialization

---

# 15. CRON / TIMER

## Recommended

### systemd user timer

```text
every 30 minutes
```

### fallback

```text
*/30 * * * *
```

## Rule

Cron or timer only triggers.

Daemon executes.

---

# 16. FAILURE MODES

## 16.1 Bad classification
Mitigation:
- defaults
- manual correction
- source-specific mapping

## 16.2 Duplicate ingestion
Mitigation:
- hashing
- similarity check
- source fingerprint

## 16.3 Slow recall
Mitigation:
- retrieval composer
- caching
- active-memory budget controls
- context-engine insertion caps

## 16.4 Context pollution
Mitigation:
- context engine ranking
- strict token caps
- provenance-preserving trimming
- per-source injection policies

## 16.5 Hooks falsely assumed to provide recall
Mitigation:
- explicit documentation
- mandatory memory slot activation
- strongly recommended context engine activation
- active memory enablement guide

---

# 17. PHASED IMPLEMENTATION

## Phase 0
- target OpenClaw version pin
- host-real manifest validation
- host-real memory slot loading validation
- host-real context engine slot loading validation
- Active Memory seam investigation for target version
- `docs/COMPATIBILITY_MATRIX.md`
- `docs/TEST_STRATEGY.md`

## Phase 1
- memory slot plugin (`plugins.slots.memory`)
- search / get / status / promote
- hooks (capture only)
- basic ingest
- explicit runtime docs
- operational mode `memory-only`

## Phase 2
- context engine plugin (`plugins.slots.contextEngine`)
- active memory integration or enablement path
- source sync system
- runtime cache refresh
- operational modes `recommended` and `full`
- observable proof-of-recall harness
- smoke-tested example configs

## Phase 3
- classification improvements
- KG integration
- pinned memory and query expansion

## Phase 4
- agent diaries
- optimization
- advanced memory compaction strategy

---

# 18. SUCCESS CRITERIA

The system is successful when:

- the agent recalls prior decisions correctly
- relevant memory is consulted without requiring explicit skill calls during normal conversation
- external knowledge is accessible naturally
- memory runtime is clearly provided through the OpenClaw memory slot
- active memory and/or the context engine reliably inject relevant context before the main reply
- at least one real OpenClaw host version is pinned and validated in `docs/COMPATIBILITY_MATRIX.md`
- the memory plugin loads in a real OpenClaw host
- the context engine path is tested in a real OpenClaw host
- Active Memory either works on the target version or is precisely documented as unsupported / partially supported for that version
- `memory-only`, `recommended`, and `full` example configs are smoke-tested against the target host version
- automatic pre-reply recall is observably demonstrated in `recommended` or `full` mode without explicit skill invocation
- host-real integration tests exist in addition to unit/contract tests
- hooks keep the corpus fresh without slowing down the chat loop
- latency remains acceptable

---

# 19. FINAL OBJECTIVE

Create an agent that:

- remembers everything
- understands context across time
- acts based on past knowledge
- integrates all working materials
- becomes progressively more useful

---

# 20. DESIGN PRINCIPLES

- memory is append-only
- retrieval > summarization
- structure > flat search
- local-first
- deterministic
- observable
- auditable
- runtime recall must use official OpenClaw memory surfaces
- automatic pre-reply recall should use Active Memory and/or Context Engine, not hooks alone

---

# END
