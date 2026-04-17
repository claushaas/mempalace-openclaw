# COMPATIBILITY_MATRIX.md

## Matriz de Compatibilidade Host-Real

---

## 1. Propósito

Este documento registra compatibilidade validada contra hosts OpenClaw reais.

Ele existe para impedir duas falhas:

- inferir compatibilidade apenas a partir da documentação oficial;
- tratar um plugin teoricamente correto como se já fosse operacionalmente compatível.

Este documento é obrigatório para a execução do roadmap.

Documentos operacionais relacionados:

- contrato do runtime de memória: [MEMORY_RUNTIME.md](MEMORY_RUNTIME.md)
- contrato do context engine: [CONTEXT_ENGINE.md](CONTEXT_ENGINE.md)
- enablement e limites de Active Memory: [ACTIVE_MEMORY.md](ACTIVE_MEMORY.md)
- prova observável e estratégia de testes: [TEST_STRATEGY.md](TEST_STRATEGY.md)

---

## 2. Regras de Uso

- Toda compatibilidade deve ser classificada por versão-alvo de OpenClaw.
- Toda validação deve indicar data, método e evidência.
- Todo status deve usar um dos valores:
  - `validated`
  - `partially_validated`
  - `blocked`
  - `pending`
- Se o comportamento real divergir da documentação oficial, o comportamento real do host prevalece para a implementação.
- Status `validated` nesta etapa significa que o seam foi exercitado por harness host-real.
- As notas de cada surface deixam explícito se a evidência vem de probes de validação ou do package final do produto.

---

## 3. Versões-Alvo

| OpenClaw version | Status | Date | Install method | Notes |
|---|---|---|---|---|
| `2026.4.14` | `partially_validated` | `2026-04-16` | npm package `openclaw` | versão canônica; plugins finais `memory-mempalace`, `claw-context-mempalace`, `skill-mempalace-sync` e `sync-daemon` validados; `recommended` com recall observável validado; extensões opcionais de V2 validadas em harness dedicado; `full` segue parcialmente validado por falta de evidência do pass próprio de Active Memory |

---

## 4. Ambiente de Validação

| Campo | Valor |
|---|---|
| sistema operacional | macOS (`Darwin`) |
| runtime Node | `v24.13.1` |
| gerenciador de pacotes | `pnpm 10.33.0` |
| host temporário | `.tmp/openclaw-host/` |
| resultados temporários | `.tmp/host-real-results/` |
| scripts de execução | `pnpm host-real:*` |
| probes e harnesses rastreados | `fixtures/host-real/probe-memory-slot`, `fixtures/host-real/probe-context-engine-slot`, `packages/memory-mempalace`, `fixtures/host-real/mempalace-mcp-shim.mjs` |

---

## 5. Surface Matrix

| Surface | Required | Current status | Evidence | Notes |
|---|---|---|---|---|
| plugin manifest acceptance | yes | `validated` | `pnpm host-real:manifest` | OpenClaw aceita `openclaw.plugin.json` + `package.json` com `openclaw.extensions` para os dois probes |
| memory slot loading | yes | `validated` | `pnpm host-real:memory-slot` | o host carrega `probe-memory-slot`, resolve `plugins.slots.memory`, marca o plugin como slot selecionado e sobe o gateway com ele ativo; ver também [MEMORY_RUNTIME.md](MEMORY_RUNTIME.md) |
| final memory runtime plugin loading | yes | `validated` | `pnpm host-real:memory-mempalace` | o host carrega `memory-mempalace`, aceita a config MCP stdio, marca `memorySlotSelected: true` e sobe o gateway com o package final ativo; ver também [MEMORY_RUNTIME.md](MEMORY_RUNTIME.md) |
| hook pack loading + spool enqueue path | yes | `validated` | `pnpm host-real:mempalace-ingest-hooks` | o host instala `mempalace-ingest-hooks`, descobre os hooks e escreve spool em evento real; a Etapa 6 transfere o processamento para o `sync-daemon`; ver também [HOOKS.md](HOOKS.md) |
| context engine slot loading | yes | `validated` | `pnpm host-real:context-slot` | o host carrega `probe-context-engine-slot`, aceita `plugins.slots.contextEngine` e registra o engine em runtime real; ver também [CONTEXT_ENGINE.md](CONTEXT_ENGINE.md) |
| final context engine plugin loading | yes | `validated` | `pnpm host-real:context-engine-mempalace` | o host carrega `claw-context-mempalace`, aceita a config final, registra o engine real e sobe o gateway com o package final ativo |
| sync skill plugin loading | yes | `validated` | `pnpm host-real:skill-mempalace-sync` | o host carrega `skill-mempalace-sync`, descobre os seis comandos públicos e a root CLI `mempalace-sync` |
| filesystem source sync | yes | `validated` | `pnpm host-real:sync-filesystem` | source `filesystem` real gera `sync.db`, `runtime_refresh`, artefatos promovidos e recall consultável |
| git source sync | yes | `validated` | `pnpm host-real:sync-git` | source `git` real ingere a working tree atual, registra job/refresh e produz recall consultável |
| spool cutover | yes | `validated` | `pnpm host-real:sync-spool-cutover` | o hook pack escreve `pending/`, o `sync-daemon` drena para `processed/`, promove o artefato e registra `post-ingest` |
| stage 7 hardening regressions | yes | `validated` | `pnpm host-real:recommended-recall` + `pnpm host-real:sync-stage6` | as regressões host-real permaneceram verdes após ranking v2, cache observável, endurecimento de classificação e refresh incremental |
| advanced V2 optional recall path | conditional | `validated` | `pnpm host-real:advanced-recall` | runtime detecta capabilities opcionais, prioriza `pinned memory`, mantém `diaries` isolados por agente, aplica `compaction` transitória e continua respondendo corretamente sem criar nova surface principal |
| Active Memory seam discovery | yes | `partially_validated` | `pnpm host-real:active-memory` | a chave `plugins.entries.active-memory` é aceita e o plugin bundled existe na versão-alvo; o blocking pre-reply path ainda não foi observado ponta a ponta; ver também [ACTIVE_MEMORY.md](ACTIVE_MEMORY.md) |
| recommended mode automatic recall | yes | `validated` | `pnpm host-real:recommended-recall` | `claw-context-mempalace` executa `assemble`, usa `manager.search` + `manager.readFile`, gera `MemPalace Recall Context` e a resposta final contém o needle sem skill explícita |
| full mode automatic recall | conditional | `partially_validated` | `pnpm host-real:full-recall` | o modo `full` sobe e responde corretamente, mas o transcript observável do pass próprio de `active-memory` com `memory_search` + `memory_get` antes da resposta principal não apareceu |

---

## 6. Operational Modes

### 6.1 `memory-only`

| Item | Status | Notes |
|---|---|---|
| config example exists | `validated` | `examples/openclaw.config.memory-only.json` existe, é válido em JSON e usa a surface final `plugins.entries.memory-mempalace` |
| smoke test in host real | `validated` | `pnpm host-real:smoke:memory-only` prova boot do runtime final de memória e comportamento degradado sem context engine |
| limitations documented | `validated` | `memory-only` não é o caminho canônico para recall automático forte |

### 6.2 `recommended`

| Item | Status | Notes |
|---|---|---|
| config example exists | `validated` | `examples/openclaw.config.recommended.json` existe, é válido em JSON e usa as surfaces finais `memory-mempalace` + `claw-context-mempalace` |
| smoke test in host real | `validated` | `pnpm host-real:smoke:recommended` prova boot conjunto do runtime final de memória com o context engine final |
| observable automatic recall proof | `validated` | `pnpm host-real:recommended-recall` prova assemble real, retrieval real, bloco de contexto e resposta final correta sem skill explícita |
| limitations documented | `validated` | o engine usa o seam público de public artifacts como primeira tentativa e cai para o mirror em disco do runtime quando o ambiente linkado do host não reflete o provider registrado |

### 6.3 `full`

| Item | Status | Notes |
|---|---|---|
| config example exists | `validated` | `examples/openclaw.config.full.json` existe, é válido em JSON e usa `plugins.entries.active-memory` em vez do shape legado `agents.defaults.activeMemory` |
| smoke test in host real | `validated` | `pnpm host-real:smoke:full` prova bootstrap do conjunto `memory-mempalace` + `claw-context-mempalace` + `active-memory` |
| observable automatic recall proof | `partially_validated` | `pnpm host-real:full-recall` produz resposta correta, mas sem transcript observável do pass próprio de Active Memory |
| limitations documented | `validated` | Active Memory continua apenas parcialmente validado nesta versão-alvo |

### 6.4 `advanced`

| Item | Status | Notes |
|---|---|---|
| config example exists | `validated` | `examples/openclaw.config.advanced.json` existe, é válido em JSON e ativa apenas flags opcionais de V2 |
| host-real advanced harness | `validated` | `pnpm host-real:advanced-recall` prova `query expansion`, priorização de `pinned memory`, `agent diaries` isolados por agente e `compaction` transitória |
| limitations documented | `validated` | as extensões avançadas ficam desligadas por default e degradam de forma observável quando o backend não expõe as tools MCP opcionais |

### 6.5 Operação de Sync

| Item | Status | Notes |
|---|---|---|
| command plugin exists | `validated` | `skill-mempalace-sync` carrega em host real e expõe os seis comandos públicos |
| root CLI exists | `validated` | `openclaw mempalace-sync` responde com help e subcomandos reais |
| `filesystem` source | `validated` | `pnpm host-real:sync-filesystem` prova `add-source`, `run`, `status`, `sync.db` e recall consultável |
| `git` source | `validated` | `pnpm host-real:sync-git` prova ingestão da working tree atual |
| spool cutover | `validated` | `pnpm host-real:sync-spool-cutover` prova enqueue pelo hook pack e drenagem pelo `sync-daemon` |

---

## 7. Evidências da Etapa 0A

### 7.1 Manifest e discovery

- comando: `pnpm host-real:manifest`
- relatório: `.tmp/host-real-results/host-real-manifest.json`
- prova produzida:
  - bootstrap isolado do host em `.tmp/openclaw-host/`;
  - instalação linkada dos probes;
  - `plugins inspect` com manifests aceitos pelo host;
  - `config validate --json` no ambiente isolado.

### 7.2 Memory slot

- comando: `pnpm host-real:memory-slot`
- relatório: `.tmp/host-real-results/host-real-memory-slot.json`
- prova produzida:
  - config isolada com `plugins.slots.memory = "probe-memory-slot"`;
  - `plugins inspect` marcando `memorySlotSelected: true` e `activationReason: "selected memory slot"`;
  - bootstrap do gateway com `probe-memory-slot` listado entre os plugins ativos;
  - JSONL de evidência do probe em `.tmp/host-real-results/probe-memory-slot.jsonl`.

### 7.3 Context engine

- comando: `pnpm host-real:context-slot`
- relatório: `.tmp/host-real-results/host-real-context-slot.json`
- prova produzida:
  - config isolada com `plugins.slots.contextEngine = "probe-context-engine-slot"`;
  - `plugins inspect` confirmando registro do context engine;
  - bootstrap do gateway em host real;
  - JSONL de evidência do probe em `.tmp/host-real-results/probe-context-engine-slot.jsonl`.

### 7.4 Active Memory

- comando: `pnpm host-real:active-memory`
- relatório: `.tmp/host-real-results/host-real-active-memory.json`
- prova produzida:
  - config isolada usando `plugins.entries.active-memory`;
  - `plugins inspect active-memory --json` em `openclaw@2026.4.14`;
  - `config validate --json` aceitando o shape configurado;
  - bootstrap do gateway com o plugin bundled habilitado.

### 7.5 All-in-one

- comando: `pnpm host-real:all`
- função: roda a suíte da Etapa 0A em sequência e regrava todos os relatórios temporários.

### 7.6 Package final `memory-mempalace`

- comando: `pnpm host-real:memory-mempalace`
- relatório: `.tmp/host-real-results/host-real-memory-mempalace.json`
- prova produzida:
  - build real do monorepo antes da instalação host-real;
  - instalação linkada do package final `packages/memory-mempalace`;
  - config isolada com `plugins.slots.memory = "memory-mempalace"` e backend MCP stdio apontando para `fixtures/host-real/mempalace-mcp-shim.mjs`;
  - `plugins inspect` marcando `memorySlotSelected: true` e `activationReason: "selected memory slot"`;
  - bootstrap do gateway com `memory-mempalace` listado entre os plugins ativos;
  - JSONL de evidência do package final em `.tmp/host-real-results/memory-mempalace.jsonl`.

### 7.7 Hook pack `mempalace-ingest-hooks`

- comando: `pnpm host-real:mempalace-ingest-hooks`
- relatório: `.tmp/host-real-results/host-real-mempalace-ingest-hooks.json`
- prova produzida:
  - instalação linkada do hook pack `packages/mempalace-ingest-hooks`;
  - descoberta real dos hooks via `openclaw hooks list --json`;
  - captura host-real do evento `command:new`;
  - criação de arquivo no spool local.

Observação:

- esta evidência continua útil para discovery e enqueue do hook pack;
- a partir da Etapa 6, o processamento do spool deixa de ser responsabilidade do hook pack e passa para o `sync-daemon`.

### 7.8 Package final `claw-context-mempalace`

- comando: `pnpm host-real:context-engine-mempalace`
- relatório: `.tmp/host-real-results/host-real-context-engine-mempalace.json`
- prova produzida:
  - instalação linkada do package final `packages/context-engine-mempalace`;
  - `plugins inspect claw-context-mempalace --json` confirmando registro do engine;
  - bootstrap do gateway com `claw-context-mempalace` listado entre os plugins ativos;
  - evidência JSONL do package final em `.tmp/host-real-results/claw-context-mempalace.jsonl`.

### 7.9 Modos operacionais reais

- `pnpm host-real:smoke:memory-only`
  - prova boot do modo `memory-only` com o runtime final de memória.
- `pnpm host-real:smoke:recommended`
  - prova boot do modo `recommended` com os packages finais.
- `pnpm host-real:recommended-recall`
  - prova canônica de recall automático observável do repositório.
- `pnpm host-real:smoke:full`
  - prova bootstrap do modo `full`.
- `pnpm host-real:full-recall`
  - best-effort real do modo `full`, mantendo `partially_validated` quando o pass próprio de Active Memory não fica observável.

### 7.10 Sync daemon e skill operacional

- `pnpm host-real:skill-mempalace-sync`
  - prova o plugin de comandos final, os seis comandos públicos e a root CLI `mempalace-sync`.
- `pnpm host-real:sync-filesystem`
  - prova source `filesystem`, `sync.db`, `runtime_refresh` e recall consultável.
- `pnpm host-real:sync-git`
  - prova source `git` usando a working tree atual.
- `pnpm host-real:sync-spool-cutover`
  - prova o cutover do spool: hooks enqueue-only, `sync-daemon` como único executor.
- `pnpm host-real:sync-stage6`
  - relatório consolidado da Etapa 6.
- `pnpm host-real:advanced-recall`
  - prova consolidada da Etapa 8 para `Knowledge Graph` opcional, `pinned memory`, `query expansion`, `agent diaries` e `compaction` transitória.

---

## 8. Limitações Conhecidas Após a Etapa 0A

- Os probes desta etapa **não** implementam `memory-mempalace` nem `claw-context-mempalace`.
- `validated` nesta etapa prova o seam do host, não a integração com MemPalace.
- Em `openclaw@2026.4.14`, selecionar um memory slot externo desativa `memory-core`. Como `memory-core` é dono da árvore CLI `openclaw memory`, essa árvore não é um harness válido para plugins externos nesta etapa.
- O seam de Active Memory está **disponível e configurável** em `2026.4.14`, mas o pass próprio pré-resposta ainda não foi provado com transcript observável.
- O `recommended` já é o baseline operacional do projeto para recall automático forte.
- As extensões avançadas de V2 ficam desligadas por default e não alteram o contrato base `memory_*`.
- Em ambiente host-real linkado, `listActiveMemoryPublicArtifacts(...)` pode não refletir o provider registrado do plugin final; o `claw-context-mempalace` usa esse seam primeiro e cai para o mirror público em disco do `memory-mempalace` quando necessário.
- No harness de `sync-spool-cutover`, o comando `/new` já provou captura host-real do hook pack, mas o agente do gateway pode cair no provider default do host e falhar por auth. O critério de aceite desse harness é o cutover do spool, não a resposta do agente.

---

## 9. Critério de Atualização

Este documento deve ser atualizado sempre que ocorrer qualquer um dos eventos abaixo:

- pin de nova versão-alvo do OpenClaw;
- mudança do manifest ou seam de plugin;
- mudança do seam de Active Memory;
- mudança do formato dos configs de exemplo;
- regressão de smoke test;
- alteração do harness de prova observável de recall;
- alteração dos scripts `pnpm host-real:*` ou dos probes em `fixtures/host-real/`.
