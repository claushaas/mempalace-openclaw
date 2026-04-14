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

## 3. Modos Operacionais e Smoke Tests

### 3.1 `memory-only`

Arquivo:

- `examples/openclaw.config.memory-only.json`

Smoke test mínimo:

- host inicializa com `memory-mempalace`;
- slot de memória carrega;
- runtime responde a uma consulta simples;
- limitações ficam registradas em `docs/COMPATIBILITY_MATRIX.md`.

### 3.2 `recommended`

Arquivo:

- `examples/openclaw.config.recommended.json`

Smoke test mínimo:

- host inicializa com `memory-mempalace` e `claw-context-mempalace`;
- os dois slots carregam;
- o contexto consulta o runtime antes da resposta;
- a prova observável de recall automático passa.

### 3.3 `full`

Arquivo:

- `examples/openclaw.config.full.json`

Smoke test mínimo:

- host inicializa com `memory-mempalace`, `claw-context-mempalace` e Active Memory;
- os surfaces suportados na versão-alvo carregam;
- a prova observável de recall automático passa;
- qualquer limitação fica documentada com precisão.

---

## 4. Prova Observável de Recall Automático

Este projeto só pode ser considerado pronto se houver ao menos um teste ou harness que prove, em `recommended` ou `full`, o seguinte fluxo:

1. Ingerir uma memória conhecida no MemPalace.
2. Encerrar o passo de ingestão.
3. Enviar um novo prompt cuja resposta correta dependa dessa memória.
4. Verificar que a memória foi recuperada antes da resposta principal.
5. Verificar que o usuário não precisou invocar skill explícita.

### 4.1 Evidência mínima exigida

- logs ou traces do runtime de memória;
- logs ou traces do context engine e/ou Active Memory;
- saída final do harness;
- referência cruzada em `docs/COMPATIBILITY_MATRIX.md`.

### 4.2 Cenário canônico inicial

O primeiro harness deve usar um corpus pequeno e determinístico, com:

- uma decisão anterior persistida;
- um prompt posterior que dependa dessa decisão;
- um assertion claro de que o contexto correto foi recuperado.

---

## 5. Testes de Regressão

Devem existir regressões para:

- fatos duráveis;
- conversas;
- artefatos externos;
- recência conflitante;
- múltiplas fontes sobrepostas;
- falha parcial do daemon;
- refresh após nova ingestão.

---

## 6. Invariantes Obrigatórios

- hooks não são o principal mecanismo de recall pré-resposta;
- memória durável não usa sumários como source of truth;
- o plugin de memória é replacement runtime, não utilitário lateral;
- `memory_index` não é no-op;
- compatibilidade de host não é presumida sem validação real;
- pelo menos um modo suportado prova recall automático observável sem skill explícita.

---

## 7. Gating de Pronto

O repositório não pode ser marcado como pronto enquanto faltar qualquer um destes itens:

- versão-alvo de OpenClaw pinada;
- smoke test `memory-only` em host real;
- smoke test `recommended` em host real;
- prova observável de recall automático aprovada em `recommended` ou `full`;
- status real de Active Memory documentado para a versão-alvo;
- configs de exemplo validadas;
- cobertura de testes local, de contrato e host-real suficiente para manutenção segura.
