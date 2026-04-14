# COMPATIBILITY_MATRIX.md

## Matriz de Compatibilidade Host-Real

---

## 1. Propósito

Este documento registra compatibilidade validada contra hosts OpenClaw reais.

Ele existe para impedir duas falhas:

- inferir compatibilidade apenas a partir da documentação oficial;
- tratar um plugin teoricamente correto como se já fosse operacionalmente compatível.

Este documento é obrigatório para a execução do roadmap.

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

---

## 3. Versões-Alvo

| OpenClaw version | Status | Notes |
|---|---|---|
| `TBD during roadmap Etapa 0A` | `pending` | A primeira versão-alvo deve ser pinada antes da implementação profunda dos plugins |

---

## 4. Surface Matrix

| Surface | Required | Current status | Evidence | Notes |
|---|---|---|---|---|
| plugin manifest acceptance | yes | `pending` | to be recorded in Etapa 0A | validar manifest real aceito pelo host |
| memory slot loading | yes | `pending` | to be recorded in Etapa 0A | `plugins.slots.memory = "memory-mempalace"` |
| context engine slot loading | yes | `pending` | to be recorded in Etapa 0A | `plugins.slots.contextEngine = "claw-context-mempalace"` |
| Active Memory seam discovery | yes | `pending` | to be recorded in Etapa 0A | descobrir chave real, limites e estabilidade |
| recommended mode automatic recall | yes | `pending` | to be recorded in test strategy | este é o piso mínimo esperado para recall forte se full não estiver disponível |
| full mode automatic recall | conditional | `pending` | to be recorded in test strategy | depende do seam real de Active Memory |

---

## 5. Operational Modes

### 5.1 `memory-only`

| Item | Status | Notes |
|---|---|---|
| config example exists | `pending` | `examples/openclaw.config.memory-only.json` |
| smoke test in host real | `pending` | deve provar carregamento do slot e funcionamento básico |
| limitations documented | `pending` | recall automático forte pode ser limitado |

### 5.2 `recommended`

| Item | Status | Notes |
|---|---|---|
| config example exists | `pending` | `examples/openclaw.config.recommended.json` |
| smoke test in host real | `pending` | deve provar memory slot + context engine |
| observable automatic recall proof | `pending` | sem skill explícita |
| limitations documented | `pending` | deve registrar qualquer degradação sem Active Memory |

### 5.3 `full`

| Item | Status | Notes |
|---|---|---|
| config example exists | `pending` | `examples/openclaw.config.full.json` |
| smoke test in host real | `pending` | deve provar os três surfaces |
| observable automatic recall proof | `pending` | sem skill explícita |
| limitations documented | `pending` | registrar bloqueios ou suporte parcial do Active Memory |

---

## 6. Evidências Obrigatórias por Versão

Para cada versão-alvo pinada, registrar:

- versão exata;
- sistema operacional / ambiente onde a validação ocorreu;
- forma de instalação do OpenClaw host;
- localização do manifest validado;
- comando ou harness usado para carregar plugins;
- resultado do smoke test `memory-only`;
- resultado do smoke test `recommended`;
- resultado do smoke test `full`, ou razão exata para indisponibilidade;
- link ou referência cruzada para o teste/harness de prova observável de recall.

---

## 7. Critério de Atualização

Este documento deve ser atualizado sempre que ocorrer qualquer um dos eventos abaixo:

- pin de nova versão-alvo do OpenClaw;
- mudança do manifest ou seam de plugin;
- mudança do seam de Active Memory;
- mudança do formato dos configs de exemplo;
- regressão de smoke test;
- alteração do harness de prova observável de recall.
