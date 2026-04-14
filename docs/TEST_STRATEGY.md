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

---

## 2. Pirâmide de Testes

### 2.1 Unitários

Cobrem:

- schemas e parsing de `packages/shared`;
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

### 2.3 Integração Local

Cobrem:

- hooks -> spool -> daemon -> MemPalace -> runtime;
- runtime -> context engine;
- config examples -> validação -> boot mínimo;
- refresh e status do runtime.

### 2.4 Host-Real

Cobrem:

- manifest acceptance;
- carregamento do slot de memória;
- carregamento do slot de context engine;
- seam real do Active Memory na versão-alvo;
- smoke tests por modo operacional.

---

## 3. Harnesses Host-Real da Etapa 0A

Os harnesses abaixo existem para fechar o seam com OpenClaw antes da implementação profunda dos packages do produto.

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

- `pending`

Bloqueio atual:

- depende do package real `packages/memory-mempalace`.

### 4.2 `recommended`

Arquivo:

- `examples/openclaw.config.recommended.json`

Smoke test mínimo:

- host inicializa com `memory-mempalace` e `claw-context-mempalace`;
- os dois slots carregam;
- o contexto consulta o runtime antes da resposta;
- a prova observável de recall automático passa.

Status atual:

- `pending`

Bloqueio atual:

- depende dos packages reais `packages/memory-mempalace` e `packages/context-engine-mempalace`.

### 4.3 `full`

Arquivo:

- `examples/openclaw.config.full.json`

Smoke test mínimo:

- host inicializa com `memory-mempalace`, `claw-context-mempalace` e Active Memory;
- os surfaces suportados na versão-alvo carregam;
- a prova observável de recall automático passa;
- qualquer limitação fica documentada com precisão.

Status atual:

- `pending`

Bloqueio atual:

- depende dos plugins reais e do path Active Memory operacional.

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
- referência cruzada em `docs/COMPATIBILITY_MATRIX.md`.

### 5.2 Cenário canônico inicial

O primeiro harness deve usar um corpus pequeno e determinístico, com:

- uma decisão anterior persistida;
- um prompt posterior que dependa dessa decisão;
- um assertion claro de que o contexto correto foi recuperado.

### 5.3 Estado atual

- inexistente

Razão:

- Etapa 0A fecha apenas o seam do host.
- A prova canônica depende dos packages finais e do path ingestão -> retrieval -> context injection real.

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
