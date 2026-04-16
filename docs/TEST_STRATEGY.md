# TEST_STRATEGY.md

## Estratégia de Testes

---

## 1. Objetivo

Garantir que este repositório entregue um runtime replacement operacional para OpenClaw, e não apenas uma arquitetura coerente em documentação.

Os testes precisam cobrir:

- corretude local dos contratos;
- integração entre ingestão, retrieval e context injection;
- compatibilidade com um host OpenClaw real;
- prova observável de recall automático pré-resposta.

Documentos operacionais relacionados:

- contrato do runtime de memória: [MEMORY_RUNTIME.md](MEMORY_RUNTIME.md)
- contrato do context engine: [CONTEXT_ENGINE.md](CONTEXT_ENGINE.md)
- contrato de hooks e spool: [HOOKS.md](HOOKS.md)
- enablement e limites de Active Memory: [ACTIVE_MEMORY.md](ACTIVE_MEMORY.md)
- entidades e envelopes compartilhados: [MEMORY_PROTOCOL.md](MEMORY_PROTOCOL.md)

---

## 2. Pirâmide de Testes

### 2.1 Unitários

Cobrem:

- schemas e parsing de `packages/shared`, conforme o contrato lógico descrito em [MEMORY_PROTOCOL.md](MEMORY_PROTOCOL.md);
- ranking, deduplicação e retrieval composer;
- classificação leve;
- envelopes de hooks;
- parsing de configs e sources.

### 2.2 Contrato

Cobrem:

- `memory_search`
- `memory_get`
- `memory_status`
- `memory_index`
- `memory_promote`

Esses testes devem usar fake `MemPalaceClient`.

O contrato alvo dessas superfícies está congelado em [MEMORY_RUNTIME.md](MEMORY_RUNTIME.md).

### 2.3 Integração Local

Cobrem:

- hooks -> spool -> sync-daemon -> MemPalace -> runtime;
- runtime -> context engine;
- config examples -> validação -> boot mínimo;
- refresh e status do runtime.
- diagnósticos e benchmark locais com corpus fixo da Etapa 7.

As fronteiras lógicas dessas integrações estão descritas em [HOOKS.md](HOOKS.md), [MEMORY_RUNTIME.md](MEMORY_RUNTIME.md) e [CONTEXT_ENGINE.md](CONTEXT_ENGINE.md).

### 2.4 Host-Real

Cobrem:

- manifest acceptance;
- carregamento do slot de memória;
- carregamento do slot de context engine;
- seam real do Active Memory na versão-alvo;
- smoke tests por modo operacional.

Os limites atualmente observados do host-alvo estão em [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md) e [ACTIVE_MEMORY.md](ACTIVE_MEMORY.md).

---

## 3. Harnesses Host-Real da Etapa 0A

Os harnesses abaixo existem para fechar o seam com OpenClaw antes e durante a implementação dos packages do produto.

Os harnesses com probes não contam como prova da integração final `memory-mempalace` ou `claw-context-mempalace`. A partir das Etapas 3 e 5:

- `pnpm host-real:memory-mempalace` conta como prova host-real do package final de memória;
- `pnpm host-real:context-engine-mempalace` conta como prova host-real do package final de context engine;
- `pnpm host-real:recommended-recall` é o harness canônico de aceite para recall automático observável.

Todos usam:

- versão pinada `openclaw@2026.4.14`
- ambiente isolado em `.tmp/openclaw-host/`
- relatórios temporários em `.tmp/host-real-results/`
- probes rastreados em `fixtures/host-real/`

### 3.1 `pnpm host-real:bootstrap`

Prova:

- o host canônico existe localmente via dependência pinada;
- o ambiente isolado pode ser inicializado sem tocar o perfil real do usuário;
- existe config válida mínima para os harnesses seguintes.

Artefatos:

- `.tmp/host-real-results/bootstrap.json`
- `.tmp/host-real-results/host-real-bootstrap.json`

### 3.2 `pnpm host-real:manifest`

Prova:

- `openclaw.plugin.json` dos probes é aceito pelo host;
- `package.json` com `openclaw.extensions` é aceito pelo host;
- `plugins inspect` consegue descobrir os probes em host real.

Artefatos:

- `.tmp/host-real-results/host-real-manifest.json`

### 3.3 `pnpm host-real:memory-slot`

Prova:

- o host aceita `plugins.slots.memory = "probe-memory-slot"`;
- `plugins inspect` marca o probe como memory slot selecionado;
- o bootstrap do gateway sobe com `probe-memory-slot` ativo.

Artefatos:

- `.tmp/host-real-results/host-real-memory-slot.json`
- `.tmp/host-real-results/probe-memory-slot.jsonl`

Observação host-real:

- em `openclaw@2026.4.14`, selecionar um plugin externo para o slot `memory` desativa `memory-core`;
- por consequência, a árvore CLI `openclaw memory` some nesse modo e não é um harness utilizável para validar um memory slot externo.

### 3.4 `pnpm host-real:context-slot`

Prova:

- o host aceita `plugins.slots.contextEngine = "probe-context-engine-slot"`;
- o plugin registra um context engine real no host;
- o bootstrap do gateway com esse slot configurado não falha por ausência do engine.

Artefatos:

- `.tmp/host-real-results/host-real-context-slot.json`
- `.tmp/host-real-results/probe-context-engine-slot.jsonl`

### 3.5 `pnpm host-real:active-memory`

Prova:

- a chave `plugins.entries.active-memory` existe e é aceita pela versão-alvo;
- o plugin bundled `active-memory` está presente em `openclaw@2026.4.14`;
- o gateway aceita subir com essa superfície habilitada.

Classificação atual:

- `partially_validated`

Motivo:

- esta etapa prova discovery, config e bootstrap;
- ainda não prova o blocking pre-reply pass em uma conversa real.

Artefatos:

- `.tmp/host-real-results/host-real-active-memory.json`

### 3.6 `pnpm host-real:all`

Função:

- roda `bootstrap`, `manifest`, `memory-slot`, `context-slot` e `active-memory` em sequência;
- deve ser usado antes de atualizar `docs/COMPATIBILITY_MATRIX.md` quando a versão-alvo mudar.

### 3.7 `pnpm host-real:memory-mempalace`

Prova:

- o package final `packages/memory-mempalace` instala por link em host real;
- o host aceita `plugins.slots.memory = "memory-mempalace"` com config MCP stdio;
- `plugins inspect memory-mempalace --json` marca o plugin como memory slot selecionado;
- o bootstrap do gateway sobe com `memory-mempalace` entre os plugins ativos;
- o package final emite evidência JSONL própria.

Artefatos:

- `.tmp/host-real-results/host-real-memory-mempalace.json`
- `.tmp/host-real-results/memory-mempalace.jsonl`

Limite:

- este harness usa `fixtures/host-real/mempalace-mcp-shim.mjs` como backend MemPalace MCP local;
- ele prova slot loading e bootstrap do runtime final, não prova ainda recall automático pré-resposta.

### 3.8 `pnpm host-real:mempalace-ingest-hooks`

Prova:

- o hook pack real instala em host OpenClaw;
- `openclaw hooks list --json` e `openclaw hooks check --json` descobrem os hooks da Etapa 4;
- um evento host-real suportado escreve envelope no spool;
- o hook pack opera como enqueue-only no spool canônico do host state dir;
- o conteúdo só é promovido quando o `sync-daemon` drena o spool.

Artefatos:

- `.tmp/host-real-results/host-real-mempalace-ingest-hooks.json`
- `.tmp/host-real-results/mempalace-ingest-hooks.jsonl`

Limite:

- este harness prova captura e enqueue observáveis;
- ele não prova recall automático pré-resposta.

### 3.9 `pnpm host-real:context-engine-mempalace`

Prova:

- o package final `packages/context-engine-mempalace` instala por link em host real;
- o host aceita `plugins.slots.contextEngine = "claw-context-mempalace"`;
- `plugins inspect claw-context-mempalace --json` registra o engine final;
- o bootstrap do gateway sobe com o package final ativo.

Artefatos:

- `.tmp/host-real-results/host-real-context-engine-mempalace.json`
- `.tmp/host-real-results/claw-context-mempalace.jsonl`

### 3.10 `pnpm host-real:smoke:memory-only`

Prova:

- o modo `memory-only` inicializa com `memory-mempalace`;
- o host seleciona o slot `memory` final;
- o comportamento degradado sem context engine é observável e documentável.

### 3.11 `pnpm host-real:smoke:recommended`

Prova:

- o host inicializa com `memory-mempalace` + `claw-context-mempalace`;
- os dois packages finais carregam em conjunto;
- o contexto gerado pelo engine final chega ao provider mock local.

### 3.12 `pnpm host-real:recommended-recall`

Prova:

- `claw-context-mempalace` executa `assemble()` antes da resposta principal;
- o engine consulta `manager.search(...)` e `manager.readFile(...)` do runtime final;
- o bloco `MemPalace Recall Context` é gerado;
- a resposta final contém o `needle` esperado;
- nenhuma skill explícita de memória foi invocada pelo usuário.

Status atual:

- `validated`

### 3.13 `pnpm host-real:smoke:full`

Prova:

- o host inicializa com `memory-mempalace` + `claw-context-mempalace` + `active-memory`;
- a surface final de `plugins.entries.active-memory` convive com os packages finais.

### 3.14 `pnpm host-real:full-recall`

Prova:

- best-effort real do modo `full`;
- além da resposta final, o harness tenta observar transcript do pass próprio de `active-memory`.

Status atual:

- `partially_validated`

Motivo:

- a resposta correta aparece, mas a evidência ainda vem do `claw-context-mempalace`;
- o transcript esperado de `active-memory` com `memory_search` + `memory_get` antes da resposta principal ainda não ficou observável.

### 3.15 `pnpm host-real:skill-mempalace-sync`

Prova:

- o plugin final `skill-mempalace-sync` carrega em host real;
- `plugins inspect` descobre os seis comandos públicos;
- a root CLI `openclaw mempalace-sync` está disponível;
- `list-sources --json` responde sem depender de provider externo.

### 3.16 `pnpm host-real:sync-filesystem`

Prova:

- `mempalace_sync_add_source` aceita arquivo JSON real com `kind = "filesystem"`;
- `mempalace_sync_run` cria job, atualiza `files` e `runtime_refresh` em `sync.db`;
- o conteúdo ingerido fica consultável via `memory-mempalace` e recallável via `claw-context-mempalace`.

### 3.17 `pnpm host-real:sync-git`

Prova:

- `mempalace_sync_add_source` aceita arquivo JSON real com `kind = "git"`;
- o daemon ingere a working tree atual, sem depender de histórico de commits;
- o conteúdo ingerido fica consultável e recallável em host real.

### 3.18 `pnpm host-real:sync-spool-cutover`

Prova:

- o hook pack escreve item em `pending/`;
- `mempalace_sync_run` drena o spool com o `sync-daemon`;
- o item vai para `processed/`, o artefato entra no backend smoke e um `runtime_refresh` é registrado.

Observação:

- o disparo de `/new` neste harness já provou enqueue host-real, mas a execução do agente do gateway pode cair no provider default do host e falhar por auth;
- isso não invalida o harness porque o critério de aceite aqui é o cutover `pending -> processed` com ingestão e refresh observáveis.

### 3.19 `pnpm host-real:sync-stage6`

Função:

- orquestra `host-real:skill-mempalace-sync`, `host-real:sync-filesystem`, `host-real:sync-git` e `host-real:sync-spool-cutover`;
- produz um relatório consolidado da Etapa 6.

---

## 4. Modos Operacionais e Smoke Tests

### 4.1 `memory-only`

Arquivo:

- `examples/openclaw.config.memory-only.json`

Smoke test mínimo:

- host inicializa com `memory-mempalace`;
- slot de memória carrega;
- runtime responde a uma consulta simples;
- limitações ficam registradas em `docs/COMPATIBILITY_MATRIX.md`.

Status atual:

- `validated`

Observação:

- este modo continua operacional, mas não é o caminho canônico para recall automático forte.

### 4.2 `recommended`

Arquivo:

- `examples/openclaw.config.recommended.json`

Smoke test mínimo:

- host inicializa com `memory-mempalace` e `claw-context-mempalace`;
- os dois slots carregam;
- o contexto consulta o runtime antes da resposta;
- a prova observável de recall automático passa.

Status atual:

- `validated`

Observação:

- `pnpm host-real:recommended-recall` é o critério canônico de aceite do projeto para recall automático observável.

### 4.3 `full`

Arquivo:

- `examples/openclaw.config.full.json`

Smoke test mínimo:

- host inicializa com `memory-mempalace`, `claw-context-mempalace` e Active Memory;
- os surfaces suportados na versão-alvo carregam;
- a prova observável de recall automático passa;
- qualquer limitação fica documentada com precisão.

Status atual:

- `partially_validated`

Bloqueio atual:

- o bootstrap do modo `full` já passa com os plugins finais.
- o pass próprio de Active Memory ainda não ficou observável em transcript.
- os limites atuais de enablement estão em [ACTIVE_MEMORY.md](ACTIVE_MEMORY.md).

---

## 5. Prova Observável de Recall Automático

Este projeto só pode ser considerado pronto se houver ao menos um teste ou harness que prove, em `recommended` ou `full`, o seguinte fluxo:

1. Ingerir uma memória conhecida no MemPalace.
2. Encerrar o passo de ingestão.
3. Enviar um novo prompt cuja resposta correta dependa dessa memória.
4. Verificar que a memória foi recuperada antes da resposta principal.
5. Verificar que o usuário não precisou invocar skill explícita.

### 5.1 Evidência mínima exigida

- logs ou traces do runtime de memória;
- logs ou traces do context engine e/ou Active Memory;
- saída final do harness;
- referência cruzada em [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md).

### 5.2 Cenário canônico inicial

O primeiro harness deve usar um corpus pequeno e determinístico, com:

- uma decisão anterior persistida;
- um prompt posterior que dependa dessa decisão;
- um assertion claro de que o contexto correto foi recuperado.

### 5.3 Estado atual

- `recommended`: `validated`
- `full`: `partially_validated`

Razão:

- o harness `pnpm host-real:recommended-recall` já prova o fluxo ingestão -> retrieval -> context injection -> resposta final correta sem skill explícita;
- o harness `pnpm host-real:full-recall` ainda não captura o transcript esperado do pass próprio de Active Memory antes da resposta principal.

---

## 6. Testes de Regressão

Devem existir regressões para:

- fatos duráveis;
- conversas;
- artefatos externos;
- recência conflitante;
- múltiplas fontes sobrepostas;
- falha parcial do daemon;
- refresh após nova ingestão.

Além disso, a Etapa 7 adiciona os scripts locais:

- `pnpm diagnostic:stage7`
  - gera `.tmp/diagnostics/stage7-diagnostic.json`
  - valida ranking v2, cache observável, steady state sem refresh e mitigação documentada dos failure modes.
- `pnpm benchmark:stage7`
  - gera `.tmp/diagnostics/stage7-benchmark.json`
  - mede latência de busca, latência de refresh, throughput de ingest e sinais de dedupe.

Regressões host-real obrigatórias da Etapa 7:

- `pnpm host-real:recommended-recall`
- `pnpm host-real:sync-stage6`

Regressão host-real best-effort:

- `pnpm host-real:full-recall`

---

## 7. Invariantes Obrigatórios

- hooks não são o principal mecanismo de recall pré-resposta;
- memória durável não usa sumários como source of truth;
- o plugin de memória é replacement runtime, não utilitário lateral;
- `memory_index` não é no-op;
- compatibilidade de host não é presumida sem validação real;
- pelo menos um modo suportado prova recall automático observável sem skill explícita.

---

## 8. Gating de Pronto

O repositório não pode ser marcado como pronto enquanto faltar qualquer um destes itens:

- versão-alvo de OpenClaw pinada;
- smoke test `memory-only` em host real;
- smoke test `recommended` em host real;
- prova observável de recall automático aprovada em `recommended` ou `full`;
- status real de Active Memory documentado para a versão-alvo;
- configs de exemplo validadas;
- cobertura de testes local, de contrato e host-real suficiente para manutenção segura.
