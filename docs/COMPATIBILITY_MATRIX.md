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
- Status `validated` nesta etapa significa que o seam foi exercitado por harness host-real. Não significa que os plugins finais `memory-mempalace` e `claw-context-mempalace` já existam.

---

## 3. Versões-Alvo

| OpenClaw version | Status | Date | Install method | Notes |
|---|---|---|---|---|
| `2026.4.14` | `partially_validated` | `2026-04-14` | npm package `openclaw` | versão canônica da Etapa 0A; seams de manifest, memory slot e context engine validados com probes; Active Memory parcialmente validado |

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
| probes rastreados | `fixtures/host-real/probe-memory-slot`, `fixtures/host-real/probe-context-engine-slot` |

---

## 5. Surface Matrix

| Surface | Required | Current status | Evidence | Notes |
|---|---|---|---|---|
| plugin manifest acceptance | yes | `validated` | `pnpm host-real:manifest` | OpenClaw aceita `openclaw.plugin.json` + `package.json` com `openclaw.extensions` para os dois probes |
| memory slot loading | yes | `validated` | `pnpm host-real:memory-slot` | o host carrega `probe-memory-slot`, resolve `plugins.slots.memory`, marca o plugin como slot selecionado e sobe o gateway com ele ativo; ver também [MEMORY_RUNTIME.md](MEMORY_RUNTIME.md) |
| context engine slot loading | yes | `validated` | `pnpm host-real:context-slot` | o host carrega `probe-context-engine-slot`, aceita `plugins.slots.contextEngine` e registra o engine em runtime real; ver também [CONTEXT_ENGINE.md](CONTEXT_ENGINE.md) |
| Active Memory seam discovery | yes | `partially_validated` | `pnpm host-real:active-memory` | a chave `plugins.entries.active-memory` é aceita e o plugin bundled existe na versão-alvo; o blocking pre-reply path ainda não foi observado ponta a ponta; ver também [ACTIVE_MEMORY.md](ACTIVE_MEMORY.md) |
| recommended mode automatic recall | yes | `pending` | planned in [TEST_STRATEGY.md](TEST_STRATEGY.md) | depende dos plugins reais `memory-mempalace` + `claw-context-mempalace` e da prova observável definida na estratégia de testes |
| full mode automatic recall | conditional | `pending` | planned in [TEST_STRATEGY.md](TEST_STRATEGY.md) | depende dos plugins reais e da conclusão do path Active Memory |

---

## 6. Operational Modes

### 6.1 `memory-only`

| Item | Status | Notes |
|---|---|---|
| config example exists | `validated` | `examples/openclaw.config.memory-only.json` existe e é válido em JSON |
| smoke test in host real | `pending` | a Etapa 0A valida apenas o seam; smoke test do produto entra depois |
| limitations documented | `validated` | nesta etapa só existe prova do slot com probe, não do runtime MemPalace final |

### 6.2 `recommended`

| Item | Status | Notes |
|---|---|---|
| config example exists | `validated` | `examples/openclaw.config.recommended.json` existe e é válido em JSON |
| smoke test in host real | `pending` | depende dos packages reais e do harness de recall automático |
| observable automatic recall proof | `pending` | ainda não existe porque os plugins finais não foram implementados |
| limitations documented | `validated` | o seam do context engine está validado; o comportamento de recall automático continua pendente |

### 6.3 `full`

| Item | Status | Notes |
|---|---|---|
| config example exists | `validated` | `examples/openclaw.config.full.json` existe e é válido em JSON |
| smoke test in host real | `pending` | depende dos plugins finais e de Active Memory operacional |
| observable automatic recall proof | `pending` | ainda não existe |
| limitations documented | `validated` | Active Memory está apenas parcialmente validado nesta versão-alvo |

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

---

## 8. Limitações Conhecidas Após a Etapa 0A

- Os probes desta etapa **não** implementam `memory-mempalace` nem `claw-context-mempalace`.
- `validated` nesta etapa prova o seam do host, não a integração com MemPalace.
- Em `openclaw@2026.4.14`, selecionar um memory slot externo desativa `memory-core`. Como `memory-core` é dono da árvore CLI `openclaw memory`, essa árvore não é um harness válido para plugins externos nesta etapa.
- O seam de Active Memory está **disponível e configurável** em `2026.4.14`, mas o blocking pre-reply recall ainda não foi provado com MemPalace nem com os plugins finais.
- A prova de recall automático continua bloqueada até que o runtime real e o harness canônico existam; o desenho alvo desse harness está em [TEST_STRATEGY.md](TEST_STRATEGY.md), e os contratos dependentes estão em [MEMORY_RUNTIME.md](MEMORY_RUNTIME.md), [CONTEXT_ENGINE.md](CONTEXT_ENGINE.md) e [ACTIVE_MEMORY.md](ACTIVE_MEMORY.md).

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
