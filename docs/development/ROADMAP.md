# ROADMAP.md

## Mestre de Execução do Repositório `mempalace-openclaw`

---

## 1. Fontes Canônicas e Limites

### 1.1 Fontes canônicas

Este roadmap existe para operacionalizar a implementação completa do repositório. Ele não substitui a especificação nem a justificativa arquitetural.

Ordem de precedência:

| Prioridade | Documento | Papel |
|---|---|---|
| 1 | `docs/SPEC.md` | especificação canônica de arquitetura, contratos, runtime, fases e entregáveis |
| 2 | `docs/REASONING.md` | justificativa arquitetural, restrições conceituais, referências externas e regras de desenvolvimento |
| 3 | `docs/development/ROADMAP.md` | plano de execução detalhado, sequenciado e decision-complete |

### 1.2 Limites de interpretação

- O escopo deste roadmap é cobrir **todo o desenvolvimento do repositório**, do bootstrap ao estado de readiness.
- O roadmap assume que o repositório parte praticamente do zero, com documentação canônica já presente e quase nenhum código.
- Onde o `SPEC.md` fixa um comportamento, este roadmap apenas o operacionaliza.
- Onde o `SPEC.md` não fixa detalhe operacional, este roadmap escolhe a alternativa mais simples, robusta, local-first, auditável e compatível com a arquitetura definida.
- Este roadmap não autoriza desvio conceitual. Em especial:
  - o projeto **não** é uma skill auxiliar;
  - o projeto **é** um runtime replacement via `plugins.slots.memory`;
  - hooks **não** são o mecanismo principal de recall pré-resposta;
  - memória durável **não** deve ter sumários como source of truth.

### 1.3 Estado inicial assumido

- Diretórios existentes: `docs/` e `docs/development/`.
- Documentos existentes: `docs/SPEC.md` e `docs/REASONING.md`.
- Não há bootstrap de monorepo, packages, scripts, examples, CI nem artefatos executáveis implementados.
- Compatibilidade com OpenClaw host ainda **não** está validada e não pode ser inferida apenas dos docs oficiais.

---

## 2. Objetivo Final

Entregar um monorepo local-first em `TypeScript + Node + pnpm` que:

- expõe `memory-mempalace` como plugin obrigatório do slot `plugins.slots.memory`;
- expõe `claw-context-mempalace` como plugin recomendado do slot `plugins.slots.contextEngine`;
- suporta Active Memory quando o seam do OpenClaw estiver estável o suficiente;
- mantém pipeline auditável de ingestão, refresh e recall;
- valida tudo isso contra pelo menos um host OpenClaw real e versionado;
- disponibiliza sync operacional, hooks leves, exemplos de configuração, documentação completa e cobertura de testes suficiente para evolução segura.

---

## 3. Stack Congelada

### 3.1 Stack mandatória

| Camada | Escolha |
|---|---|
| workspace | `pnpm` |
| runtime | `Node.js` LTS atual |
| linguagem | `TypeScript` estrito |
| módulos | ESM |
| build de packages | `tsup` |
| execução dev/scripts TS | `tsx` |
| testes | `Vitest` |
| schemas/validação | `zod` |
| SQLite | `better-sqlite3` |
| descoberta de arquivos | `fast-glob` |
| watch | `chokidar` |
| logs | `pino` |

### 3.2 Regras de stack

- Não usar ORM.
- Não introduzir banco remoto.
- Não introduzir mensageria externa.
- Não introduzir framework web se não houver necessidade explícita do OpenClaw plugin runtime.
- Não introduzir abstrações genéricas prematuras para múltiplos backends de memória.
- `MemPalaceClient` será a única fronteira de acesso ao backend MemPalace.

### 3.3 Convenções obrigatórias

- `TypeScript` com `strict: true`.
- Importações por workspace package sempre que aplicável.
- Todos os packages com `package.json` próprio.
- Scripts raiz obrigatórios: `build`, `test`, `lint`, `typecheck`, `dev`, `validate-config`.
- Todo schema serializável relevante deve existir em `packages/shared`.
- Toda interface pública deve ser documentada em `docs/`.

---

## 4. Interfaces Públicas Congeladas

### 4.1 Slots do OpenClaw

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

Regras:

- `memory-mempalace` é obrigatório.
- `claw-context-mempalace` é recomendado para runtime completo.
- Active Memory deve ter caminho de enablement documentado mesmo se a implementação integral não entrar no mesmo corte.

### 4.2 Runtime API obrigatória

O runtime de memória deve expor, no mínimo:

- `memory_search`
- `memory_get`
- `memory_status`
- `memory_index`
- `memory_promote`

### 4.3 Skill commands obrigatórios

- `mempalace_sync_add_source`
- `mempalace_sync_list_sources`
- `mempalace_sync_run`
- `mempalace_sync_status`
- `mempalace_sync_remove_source`
- `mempalace_sync_reindex`

### 4.4 Arquivos públicos obrigatórios

- `examples/openclaw.config.memory-only.json`
- `examples/openclaw.config.recommended.json`
- `examples/openclaw.config.full.json`
- `examples/obsidian-source.json`
- `examples/repo-source.json`
- `docs/ARCHITECTURE.md`
- `docs/COMPATIBILITY_MATRIX.md`
- `docs/DB_SCHEMA.md`
- `docs/HOOKS.md`
- `docs/MEMORY_RUNTIME.md`
- `docs/CONTEXT_ENGINE.md`
- `docs/ACTIVE_MEMORY.md`
- `docs/MEMORY_PROTOCOL.md`
- `docs/TEST_STRATEGY.md`
- `README.md`

---

### 4.5 Modos Operacionais Obrigatórios

O repositório deve tratar os seguintes modos como produtos operacionais explícitos, não apenas como combinações implícitas de features.

| Modo | Configuração | Objetivo | Limitação aceitável | Prova mínima exigida |
|---|---|---|---|---|
| `memory-only` | apenas `memory-mempalace` | replacement runtime básico e recall explícito | recall automático forte pode ser limitado | smoke test em host real e limitações documentadas |
| `recommended` | `memory-mempalace` + `claw-context-mempalace` | caminho principal de uso do projeto | Active Memory pode estar ausente | prova observável de recall pré-resposta sem skill explícita |
| `full` | `memory-mempalace` + `claw-context-mempalace` + Active Memory | comportamento máximo suportado na versão-alvo | depende do seam real do host | prova observável de recall pré-resposta sem skill explícita |

Regras:

- Cada modo deve ter config de exemplo própria.
- Cada modo deve ter smoke test próprio.
- Cada modo deve ter limitações documentadas em `docs/COMPATIBILITY_MATRIX.md`.
- `recommended` é o modo mínimo que deve provar recall automático forte caso `full` ainda não esteja operacional na versão-alvo.

---

## 5. Referências Externas Obrigatórias

Esta seção deve ser espelhada ou referenciada nos docs operacionais do repositório.

### 5.1 OpenClaw

- `https://docs.openclaw.ai/cli/memory`
- `https://docs.openclaw.ai/concepts/memory`
- `https://docs.openclaw.ai/reference/memory-config`
- `https://docs.openclaw.ai/concepts/active-memory`
- `https://docs.openclaw.ai/concepts/context`
- `https://docs.openclaw.ai/concepts/context-engine`
- `https://docs.openclaw.ai/tools/plugin`
- `https://docs.openclaw.ai/plugins/architecture`
- `https://docs.openclaw.ai/plugins/sdk-overview`
- `https://docs.openclaw.ai/plugins/manifest`
- `https://docs.openclaw.ai/automation/hooks`
- `https://docs.openclaw.ai/plugins/memory-wiki`

### 5.2 MemPalace

- `https://github.com/MemPalace/mempalace`
- `https://github.com/MemPalace/mempalace/blob/develop/README.md`
- `https://github.com/MemPalace/mempalace/tree/develop/docs`
- `https://github.com/MemPalace/mempalace/tree/develop/benchmarks`
- `https://github.com/MemPalace/mempalace/blob/develop/mempalace/mcp_server.py`
- `https://github.com/MemPalace/mempalace/blob/develop/mempalace/searcher.py`
- `https://github.com/MemPalace/mempalace/blob/develop/mempalace/knowledge_graph.py`

---

## 6. Estrutura Final Esperada do Repositório

```text
mempalace-openclaw/
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
│   └── development/
│       └── ROADMAP.md
├── packages/
│   ├── shared/
│   ├── memory-mempalace/
│   ├── context-engine-mempalace/
│   ├── skill-mempalace-sync/
│   └── sync-daemon/
├── infra/
│   ├── systemd/
│   └── cron/
├── examples/
│   ├── openclaw.config.memory-only.json
│   ├── openclaw.config.recommended.json
│   ├── openclaw.config.full.json
│   ├── obsidian-source.json
│   └── repo-source.json
├── scripts/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.workspace.ts
├── .editorconfig
├── .gitignore
└── README.md
```

---

## 7. Plano de Execução por Etapas

Cada etapa abaixo deve ser executada na ordem definida, exceto quando o item indicar explicitamente paralelização segura.

---

## Etapa 0. Bootstrap do Monorepo

### Objetivo

Criar a base estrutural e ferramental do repositório para permitir desenvolvimento previsível, buildável e testável.

### Dependências

- `docs/SPEC.md`
- `docs/REASONING.md`

### Entregáveis

- `package.json` raiz
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `vitest.workspace.ts`
- `.editorconfig`
- `.gitignore`
- `README.md` inicial
- diretórios `packages/`, `infra/`, `examples/`, `scripts/`

### Implementação

1. Criar `package.json` raiz com:
   - `"private": true`
   - `"type": "module"`
   - scripts `build`, `test`, `lint`, `typecheck`, `dev`, `validate-config`
   - `packageManager` fixado em `pnpm`
2. Criar `pnpm-workspace.yaml` incluindo `packages/*`.
3. Criar `tsconfig.base.json` com:
   - `target` moderno compatível com Node LTS
   - `module` e `moduleResolution` alinhados a ESM
   - `strict: true`
   - `declaration: true`
   - `sourceMap: true`
4. Criar `vitest.workspace.ts` para descoberta de testes por package.
5. Padronizar `.editorconfig` para UTF-8, LF, indentação de 2 espaços.
6. Padronizar `.gitignore` com:
   - `node_modules/`
   - `dist/`
   - `.turbo/` se vier a ser usado
   - `coverage/`
   - `.DS_Store`
   - `*.tsbuildinfo`
   - artefatos temporários do daemon e spool local
7. Criar `README.md` inicial com visão curta, bootstrap local e links para docs.
8. Criar diretórios vazios necessários com arquivos sentinela apenas se indispensáveis.

### Critérios de Aceite

- `pnpm install` funciona na raiz.
- `pnpm test` e `pnpm typecheck` podem rodar mesmo antes de haver testes relevantes, sem configuração quebrada.
- A estrutura básica do monorepo corresponde ao `SPEC.md`.

### Riscos Principais

- Congelar convenções erradas de ESM/resolution logo no início.
- Criar scripts raiz que não escalam para múltiplos packages.

### Referências Obrigatórias

- `docs/SPEC.md`, seção de estrutura do repositório
- `docs/REASONING.md`, regras implícitas de desenvolvimento

---

## Etapa 0A. Validação Host-Real do Seam com OpenClaw

### Objetivo

Eliminar o principal risco do projeto antes da implementação profunda: descobrir cedo, em um host OpenClaw real, a forma exata de manifest, carregamento de slots, pontos de integração e limites de Active Memory.

### Dependências

- Etapa 0 concluída

### Entregáveis

- `docs/COMPATIBILITY_MATRIX.md`
- `docs/TEST_STRATEGY.md`
- `fixtures/host-real/probe-memory-slot`
- `fixtures/host-real/probe-context-engine-slot`
- `scripts/host-real/`
- pelo menos uma versão-alvo de OpenClaw pinada
- manifest real validado contra a versão-alvo
- prova de carregamento real do slot de memória
- prova de carregamento real do slot de context engine
- investigação documentada do seam de Active Memory

### Implementação

1. Pinar `openclaw@2026.4.14` no repositório como host canônico da Etapa 0A.
2. Criar dois probes mínimos, explicitamente fora do produto:
   - `fixtures/host-real/probe-memory-slot`
   - `fixtures/host-real/probe-context-engine-slot`
3. Criar scripts idempotentes de execução:
   - `pnpm host-real:bootstrap`
   - `pnpm host-real:manifest`
   - `pnpm host-real:memory-slot`
   - `pnpm host-real:context-slot`
   - `pnpm host-real:active-memory`
   - `pnpm host-real:all`
4. Usar `.tmp/openclaw-host/` como estado/config/workspace isolado do host e `.tmp/host-real-results/` como diretório canônico de evidências temporárias.
5. Registrar no `docs/COMPATIBILITY_MATRIX.md`:
   - versão-alvo
   - origem da validação
   - data da validação
   - status por surface
6. Validar, no host real:
   - formato do manifest aceito
   - descoberta/carregamento de plugin
   - seleção de `plugins.slots.memory`
   - seleção de `plugins.slots.contextEngine`
7. Investigar Active Memory na versão-alvo:
   - chave de configuração real
   - ordem de execução
   - limitações observadas
   - se o seam é estável, experimental ou indisponível
8. Formalizar três estados por surface:
   - `validated`
   - `partially_validated`
   - `blocked`
9. Registrar em `docs/TEST_STRATEGY.md` o plano de testes host-real e os harnesses mínimos necessários.
10. Se houver divergência entre docs oficiais e comportamento real do host, registrar a divergência explicitamente e fazer o roadmap seguir o host real.

### Implementação Concretizada na Etapa 0A

- O host canônico foi pinado em `package.json` como `openclaw@2026.4.14`.
- Os probes vivem em `fixtures/host-real/` e usam os ids:
  - `probe-memory-slot`
  - `probe-context-engine-slot`
- Os harnesses reais vivem em `scripts/host-real/`.
- O bootstrap isolado do host é feito via `openclaw onboard --non-interactive --accept-risk ...` com `OPENCLAW_STATE_DIR` e `OPENCLAW_CONFIG_PATH` apontando para `.tmp/openclaw-host/`.
- As evidências temporárias são gravadas em `.tmp/host-real-results/`.
- `Active Memory` nesta etapa usa o plugin bundled `active-memory` do próprio host-alvo. Não existe probe separado porque o objetivo aqui é validar o seam real da versão `2026.4.14`, não simular o comportamento do plugin oficial.
- Descoberta host-real relevante: em `openclaw@2026.4.14`, selecionar um memory slot externo desativa `memory-core`; portanto a árvore CLI `openclaw memory` não é um oráculo válido para a Etapa 0A quando o slot `memory` aponta para um plugin externo.

### Critérios de Aceite

- Existe pelo menos uma versão OpenClaw pinada no repositório.
- O manifest do plugin foi validado em um host real, não só por leitura de docs.
- O slot de memória foi efetivamente carregado por um host real.
- O slot de context engine foi efetivamente carregado por um host real.
- O estado do Active Memory na versão-alvo está claramente classificado.
- `docs/COMPATIBILITY_MATRIX.md` e `docs/TEST_STRATEGY.md` refletem resultados reais, não apenas intenção.

### Estado Atual da Etapa 0A

- `openclaw@2026.4.14` pinado e executável via scripts do repositório.
- manifest dos dois probes validado em host real.
- slot de memória validado por seleção explícita do slot, inspeção do plugin e bootstrap do gateway com o probe ativo.
- slot de context engine validado por registro real do engine e bootstrap do gateway com o slot configurado.
- `Active Memory` classificado como `partially_validated`: config surface aceita, plugin bundled presente e bootstrap do gateway viável, mas sem prova ainda do blocking pre-reply pass.

### Riscos Principais

- Escolher uma versão-alvo e depois ignorar suas limitações reais.
- Confundir compatibilidade inferida com compatibilidade validada.
- Prolongar implementação profunda antes de fechar o seam real do host.

### Referências Obrigatórias

- `docs/SPEC.md`, seções 4, 6, 7, 17 e 18
- `docs/REASONING.md`, seção de validação host-real

---

## Etapa 1. Documentação-Base Obrigatória

### Objetivo

Transformar o spec canônico em documentação operacional por subsistema, reduzindo ambiguidade antes da implementação dos packages.

### Dependências

- Etapa 0 concluída
- Etapa 0A concluída

### Entregáveis

- `docs/ARCHITECTURE.md`
- `docs/COMPATIBILITY_MATRIX.md`
- `docs/DB_SCHEMA.md`
- `docs/HOOKS.md`
- `docs/MEMORY_RUNTIME.md`
- `docs/CONTEXT_ENGINE.md`
- `docs/ACTIVE_MEMORY.md`
- `docs/MEMORY_PROTOCOL.md`
- `docs/TEST_STRATEGY.md`
- atualização do `README.md`

### Implementação

1. `docs/ARCHITECTURE.md`
   - detalhar componentes, ownership e fluxos end-to-end
   - incluir diagrama textual de runtime e ingest
   - diferenciar v1, v2 e não-objetivos
2. `docs/COMPATIBILITY_MATRIX.md`
   - manter versão-alvo pinada
   - manter status real por surface e por modo operacional
   - registrar limitações do host
3. `docs/DB_SCHEMA.md`
   - detalhar `sync.db`
   - listar colunas mínimas, índices, constraints e rationale
4. `docs/HOOKS.md`
   - documentar eventos, payloads, spool, idempotência
   - reforçar que hooks não fazem recall principal
5. `docs/MEMORY_RUNTIME.md`
   - documentar contratos `memory_*`
   - documentar retrieval composer
6. `docs/CONTEXT_ENGINE.md`
   - documentar formato de injeção, budget e pruning
7. `docs/ACTIVE_MEMORY.md`
   - documentar estratégia de enablement e fallback
8. `docs/MEMORY_PROTOCOL.md`
   - documentar tipos, envelopes, IDs, provenance e fluxo entre packages
9. `docs/TEST_STRATEGY.md`
   - documentar pirâmide de testes
   - documentar smoke tests por modo
   - documentar host-real tests e prova observável de recall
10. `README.md`
   - quickstart local
   - arquitetura resumida
   - modos operacionais suportados
   - matriz de packages
   - links para os docs

### Critérios de Aceite

- Cada doc explicita:
  - o que é obrigatório em v1
  - o que é recomendado
  - o que é v2
  - o que é não-objetivo
- Todos os docs usam `docs/SPEC.md` e `docs/REASONING.md` como base consistente.
- Não há contradição textual entre runtime, hooks, context engine e Active Memory.
- `COMPATIBILITY_MATRIX` e `TEST_STRATEGY` existem e são tratados como docs operacionais obrigatórios.

### Riscos Principais

- Documentação antecipar comportamento que o runtime não conseguirá cumprir.
- Misturar responsabilidade de hooks com contexto/recall.

### Referências Obrigatórias

- todo o bloco de referências externas da seção 5 deste roadmap

---

## Etapa 2. `packages/shared`: Contratos, Schemas e Tipos Canônicos

### Objetivo

Criar o package base que define todos os contratos compartilhados e impede deriva semântica entre plugin, daemon, skill e docs.

### Dependências

- Etapas 0 e 1 concluídas
- Etapa 0A concluída

### Entregáveis

- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
- `packages/shared/src/index.ts`
- módulos de tipos, schemas, enums, erros e utilidades de serialização

### Implementação

1. Criar schemas e tipos para:
   - `MemorySearchQuery`
   - `MemorySearchResult`
   - `MemoryArtifact`
   - `MemoryStatus`
   - `MemoryPromoteInput`
   - `MemoryIndexRequest`
   - `SourceConfig`
   - `SyncJob`
   - `HookEnvelope`
   - `ContextInjectionEntry`
   - `RuntimeHealth`
2. Criar enums para:
   - `MemoryType`
   - `SessionClassification`
   - `SourceKind`
   - `JobStatus`
   - `RuntimeRefreshReason`
3. Criar erros canônicos:
   - validação inválida
   - fonte não encontrada
   - artifact não encontrado
   - backend indisponível
   - refresh inválido
   - promote inválido
4. Definir `MemPalaceClient` como única fronteira de acesso ao backend com métodos:
   - `search`
   - `get`
   - `promote`
   - `refreshIndex`
   - `getHealth`
   - `listSourcesStatus`
5. Criar utilidades de:
   - parsing e normalização
   - envelopes versionados
   - metadados de provenance
   - cálculo de fingerprint básico

### Critérios de Aceite

- Todos os contratos serializáveis possuem schema `zod`.
- O package é consumível por todos os outros packages sem duplicação de tipos.
- Não há dependência do `shared` para cima.

### Riscos Principais

- Tipos frouxos demais, forçando validação tardia.
- Definir contratos já contaminados por detalhes de implementação de um package específico.

### Referências Obrigatórias

- `docs/SPEC.md`, seções de interfaces core, sync e memory model
- `docs/MEMORY_PROTOCOL.md`
- `docs/DB_SCHEMA.md`

---

## Etapa 3. `packages/memory-mempalace`: Core do Runtime de Memória

### Objetivo

Implementar o plugin obrigatório do slot `plugins.slots.memory`, tornando o MemPalace o runtime efetivo de memória durável no OpenClaw.

### Dependências

- Etapa 2 concluída

### Entregáveis

- manifest do plugin
- adapter OpenClaw
- implementação dos métodos `memory_*`
- retrieval composer
- cliente de integração com `MemPalaceClient`
- smoke harness de slot loading para host real

### Implementação

1. Estruturar o package com:
   - `manifest`
   - `src/index.ts`
   - `src/runtime/`
   - `src/retrieval/`
   - `src/client/`
   - `src/errors/`
2. Implementar `memory_search` com pipeline:
   - normalização da query
   - filtros estruturais opcionais
   - chamada ao `MemPalaceClient.search`
   - deduplicação
   - ranking
   - formatação do resultado
3. Implementar `memory_get` com resolução completa de artifact por ID.
4. Implementar `memory_status` com:
   - contagem de memórias
   - fontes configuradas
   - sync health
   - ingestion lag
   - runtime health
   - compatibilidade com context engine
   - compatibilidade com Active Memory
5. Implementar `memory_index` como comando de compatibilidade real:
   - `refresh runtime metadata`
   - `re-sync`
   - `re-mining`
   - `checkpoint refresh`
   - `local cache refresh`
6. Implementar `memory_promote` com:
   - drawer content
   - metadata classification
   - source attribution
   - session provenance
   - hooks para KG/diary apenas como extensões opcionais
7. Implementar retrieval composer obrigatório:
   - mistura memória factual, conversacional e artefatos externos
   - preserva provenance
   - aplica token budget
   - ordena por similaridade, recência, confiança e structural match
   - reserva campo para peso futuro de pinned memory
8. Implementar fallback keyword quando a busca estrutural/semântica for fraca.
9. Implementar harness mínimo para validar, em host real, que o manifest e o slot `memory` realmente carregam.

### Critérios de Aceite

- O plugin pode ser selecionado como `plugins.slots.memory = "memory-mempalace"`.
- `memory_index` não é no-op.
- Os resultados de `memory_search` retornam snippets, IDs e metadados completos.
- O runtime não se apresenta como ferramenta auxiliar; ele se comporta como replacement runtime.
- O carregamento do plugin foi exercitado contra o host OpenClaw pinado.

### Riscos Principais

- Acoplamento forte demais ao cliente concreto do MemPalace.
- Resultado de busca sem metadados suficientes para contexto downstream.
- Ranking inicial gerar poluição de contexto.

### Referências Obrigatórias

- `docs/SPEC.md`, seções 4, 5, 6 e 7
- `docs/REASONING.md`, seções sobre replacement runtime, hooks e Active Memory
- `docs/MEMORY_RUNTIME.md`
- `docs/MEMORY_PROTOCOL.md`

---

## Etapa 4. Hooks Leves, Spool Local e Ingest Básico

### Objetivo

Implementar a trilha mínima de captura assíncrona e desacoplada do loop principal de conversa.

### Dependências

- Etapas 2 e 3 concluídas

### Entregáveis

- modelagem do envelope de hook
- diretório de spool local
- normalizador de sessão
- pipeline básico de ingestão ponta a ponta

### Implementação

1. Definir spool local, por padrão, em área ignorada pelo Git.
2. Criar `HookEnvelope` versionado contendo:
   - `event`
   - `sessionId`
   - `timestamp`
   - `source`
   - `payload`
   - `fingerprint`
   - `version`
3. Implementar eventos mínimos:
   - `/new`
   - `/reset`
   - `stop`
   - `pre-compact`
   - `end-of-session`
   - `milestone`
   - `scheduled-sync`
   - `post-ingest-refresh`
4. Garantir que hooks façam apenas:
   - captura
   - flush
   - enqueue
   - refresh trigger
5. Proibir inline:
   - classificação pesada
   - busca de memória
   - mineração complexa
6. Entregar primeiro fluxo v1:
   - sessão exportada
   - envelope escrito no spool
   - processador lê spool
   - ingest básico no MemPalace
   - refresh de metadados
   - memória fica consultável pelo plugin

### Critérios de Aceite

- O loop de conversa não depende da conclusão da ingestão pesada.
- Hooks são idempotentes por envelope/fingerprint.
- O caminho hook -> spool -> ingest -> refresh é verificável por logs.

### Riscos Principais

- Fazer hooks bloqueantes.
- Misturar semântica de recall com captura.
- Perder idempotência do spool.

### Referências Obrigatórias

- `docs/SPEC.md`, seção de hooks
- `docs/HOOKS.md`
- `docs/MEMORY_PROTOCOL.md`

---

## Etapa 5. `packages/context-engine-mempalace` e Enablement de Active Memory

### Objetivo

Implementar o package recomendado para injeção disciplinada de memória em contexto e deixar o caminho de Active Memory corretamente suportado e documentado.

### Dependências

- Etapas 2, 3 e 4 concluídas

### Entregáveis

- `packages/context-engine-mempalace`
- contrato de injeção de contexto
- examples de configuração por modo operacional
- documentação de enablement de Active Memory
- smoke tests por modo
- harness de prova observável de recall automático

### Implementação

1. Criar o plugin `claw-context-mempalace`.
2. Implementar consulta ao runtime de memória antes da composição de prompt.
3. Definir formato único de `ContextInjectionEntry` com:
   - conteúdo
   - provenance
   - source
   - recency
   - classification
   - score
4. Implementar política de budget:
   - limite de número de entradas
   - limite de tokens aproximado
   - descarte de itens de menor valor primeiro
5. Implementar política de pruning:
   - priorizar fatos e decisões duráveis
   - rebaixar conteúdo redundante
   - preservar diversidade de fontes
6. Criar e manter três arquivos de config:
   - `examples/openclaw.config.memory-only.json`
   - `examples/openclaw.config.recommended.json`
   - `examples/openclaw.config.full.json`
7. Para cada modo operacional:
   - documentar limitações
   - rodar smoke test no host real
   - registrar status em `docs/COMPATIBILITY_MATRIX.md`
8. Implementar harness de prova observável de recall:
   - ingerir memória conhecida
   - enviar prompt posterior que dependa dela
   - verificar que a memória foi recuperada antes da resposta principal
   - verificar que nenhuma skill explícita foi invocada
9. Active Memory:
   - se o seam estiver estável, implementar integração real
   - se não estiver, documentar enablement preciso e fallback aceitável

### Critérios de Aceite

- A qualidade de injeção melhora quando o context engine está habilitado.
- O comportamento degradado sem context engine é claro e documentado.
- Nenhuma doc sugere que hooks fazem recall pré-resposta.
- `recommended` ou `full` prova recall automático observável sem skill explícita.
- Os três modos possuem config e smoke test próprios.

### Riscos Principais

- Múltiplos formatos de injeção competindo entre si.
- Budget mal calibrado degradando utilidade.
- Active Memory documentado de forma incompatível com a versão real do OpenClaw.

### Referências Obrigatórias

- `docs/SPEC.md`, seções 6 e 7
- `docs/REASONING.md`, seções sobre Active Memory e Context Engine
- `docs/CONTEXT_ENGINE.md`
- `docs/ACTIVE_MEMORY.md`

---

## Etapa 6. `packages/sync-daemon`, Skill Operacional e Infraestrutura de Trigger

### Objetivo

Entregar o subsistema de ingestão contínua, governança de fontes, persistência local de sync e comandos operacionais do usuário.

### Dependências

- Etapas 2, 3 e 4 concluídas
- Etapa 5 recomendada, mas não bloqueante para daemon básico

### Entregáveis

- `packages/sync-daemon`
- `packages/skill-mempalace-sync`
- `infra/systemd`
- `infra/cron`
- `examples/obsidian-source.json`
- `examples/repo-source.json`
- `sync.db`

### Implementação

1. Criar `packages/sync-daemon` com submódulos:
   - registry de fontes
   - scheduler
   - executor de jobs
   - checkpoint manager
   - deduplicação
   - normalização
   - runtime refresh
   - persistência SQLite
2. Implementar `sync.db` com tabelas:
   - `sources`
   - `jobs`
   - `files`
   - `errors`
   - `runtime_refresh`
3. Definir colunas mínimas:
   - `sources`: `id`, `type`, `path`, `config`, `enabled`
   - `jobs`: `id`, `source_id`, `status`, `started_at`, `finished_at`
   - `files`: `path`, `hash`, `last_ingested_at`
   - `errors`: `job_id`, `error_message`
   - `runtime_refresh`: `id`, `reason`, `triggered_at`, `completed_at`, `status`
4. Adicionar índices mínimos:
   - `sources(id)` único
   - `jobs(source_id, started_at)`
   - `files(path)` único
   - `runtime_refresh(triggered_at)`
5. Pipeline fixo:
   - detectar mudanças
   - hash check
   - chunk
   - classificação leve
   - dedup
   - write no MemPalace
   - refresh de runtime
6. Ordem de suporte a fontes:
   - filesystem markdown/txt
   - git repo local
   - documentos simples
   - chat exports depois da estabilidade do pipeline básico
7. Criar `packages/skill-mempalace-sync` com os seis comandos públicos definidos.
8. Criar `examples/obsidian-source.json` e `examples/repo-source.json` validados por schema.
9. Criar `infra/systemd` e `infra/cron` apenas como gatilhos do daemon.

### Critérios de Aceite

- O daemon processa mudanças com idempotência mínima.
- Os comandos operacionais são suficientes para cadastrar, listar, rodar, consultar e reindexar fontes.
- O banco local guarda histórico mínimo de fontes, jobs, arquivos e refresh.

### Riscos Principais

- Modelar o banco sem índices suficientes para idempotência.
- Misturar trigger e execução.
- Expandir para fontes complexas cedo demais.

### Referências Obrigatórias

- `docs/SPEC.md`, seções 9, 10, 11 e 15
- `docs/DB_SCHEMA.md`
- `docs/MEMORY_PROTOCOL.md`

---

## Etapa 7. Robustez de Classificação, Ranking, Cache e Failure Modes

### Objetivo

Elevar a qualidade real do sistema, cobrindo os modos de falha previstos e estabilizando recall e ingestão.

### Dependências

- Etapas 3 a 6 concluídas

### Entregáveis

- refinamento de classificação
- pesos explícitos de ranking
- refresh incremental
- cobertura dos failure modes
- benchmark e diagnósticos

### Implementação

1. Refinar classificação leve com categorias:
   - `decision`
   - `problem`
   - `milestone`
   - `artifact`
   - `conversation`
2. Formalizar pesos explícitos no ranking:
   - similaridade semântica
   - recência
   - confiança da fonte
   - structural match
   - campo reservado para pinned memory
3. Implementar cache de metadados observável:
   - nunca esconder erro de origem
   - invalidar em refresh real
   - expor estado em `memory_status`
4. Cobrir failure modes do spec:
   - classificação ruim
   - ingest duplicada
   - recall lento
   - context pollution
   - falsa suposição de hooks como recall
5. Criar fixtures:
   - corpus sintético pequeno
   - corpus de notas markdown
   - corpus de conversas
   - corpus de artefatos de código
6. Criar benchmark/diagnóstico para:
   - latência de busca
   - latência de refresh
   - throughput de ingest
   - taxa de duplicação evitada

### Critérios de Aceite

- Os failure modes do spec possuem mitigação implementada e documentada.
- `memory_status` reflete estado real de saúde e refresh.
- O ranking não depende apenas de similaridade semântica plana.

### Riscos Principais

- Criar cache opaco.
- Tunar ranking sem datasets mínimos de regressão.
- Melhorar classificação acoplando demais regras ao formato de uma única fonte.

### Referências Obrigatórias

- `docs/SPEC.md`, seções 16, 17 e 18
- `docs/REASONING.md`, motivação de recall estrutural e preservação de verdade

---

## Etapa 8. Recursos Avançados de V2 e Além

### Objetivo

Introduzir extensões avançadas sem contaminar o contrato v1 do runtime.

### Dependências

- Etapa 7 concluída

### Entregáveis

- plano e implementação incremental de KG
- suporte inicial a pinned memory/query expansion
- agent diaries
- estratégia de compaction apenas de contexto e caches

### Implementação

1. Knowledge Graph:
   - adicionar entidades, relações e validade temporal como extensão do modelo
   - manter integração opcional
2. Pinned memory/query expansion:
   - adicionar como melhoria do retrieval composer
   - não criar nova superfície principal
3. Agent diaries:
   - storage isolado por agente/subagente
   - entradas comprimidas
   - leitura de histórico próprio
4. Compaction:
   - aplicar apenas em contexto montado e caches transitórios
   - preservar memória durável como append-only

### Critérios de Aceite

- Recursos avançados entram sem quebrar contratos v1.
- O runtime base continua funcional sem KG nem diaries.
- A semântica append-only é preservada.

### Riscos Principais

- Reescrever contratos maduros por causa de V2.
- Misturar diary com memória geral sem fronteira clara.

### Referências Obrigatórias

- `docs/SPEC.md`, seções 13, 14 e 20
- `docs/REASONING.md`, capacidades de KG e diaries no MemPalace

---

## Etapa 9. Scripts, Automação, CI e Readiness

### Objetivo

Fechar o ciclo de execução com scripts operacionais, validação automatizada e critérios de pronto para uso e manutenção.

### Dependências

- Etapas 0 a 8 concluídas em nível compatível com o corte planejado
- Etapa 0A concluída e compatibilidade host-real estabilizada

### Entregáveis

- `scripts/setup.sh`
- `scripts/dev.sh`
- `scripts/validate-config.sh`
- pipeline de CI
- smoke tests de examples
- testes host-real agendáveis
- checklist de readiness no `README.md`

### Implementação

1. `scripts/setup.sh`
   - instalar dependências
   - preparar diretórios locais necessários
   - validar ambiente mínimo
2. `scripts/dev.sh`
   - rodar modo de desenvolvimento dos packages relevantes
   - facilitar watch do daemon e testes
3. `scripts/validate-config.sh`
   - validar JSONs de examples e configs
   - falhar com mensagens objetivas
4. CI mínimo:
   - `pnpm install --frozen-lockfile`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
   - smoke tests de config/examples
   - suíte host-real executável sob gating explícito
5. Expandir `README.md` com:
   - quickstart local
   - visão arquitetural curta
   - versão-alvo do host em validação
   - modos operacionais e seus limites
   - matriz de packages
   - uso dos examples
   - links para docs profundos

### Critérios de Aceite

- Um colaborador consegue subir o ambiente sem conhecer o histórico do projeto.
- CI cobre build, testes e exemplos.
- `README.md` não contradiz nenhum doc técnico.
- Existe caminho explícito para rodar smoke tests e host-real tests.

### Riscos Principais

- Scripts assumirem paths ou dependências implícitas.
- CI não refletir as garantias reais do runtime.

### Referências Obrigatórias

- `docs/SPEC.md`, seções de examples, scripts e critérios de sucesso
- `README.md`

---

## 8. Plano de Testes Global

### 8.1 Unitários

- `packages/shared`
  - schemas
  - parsing
  - defaults
  - erros
- `packages/memory-mempalace`
  - normalização de query
  - ranking
  - deduplicação
  - composer
- `packages/context-engine-mempalace`
  - budget
  - pruning
  - ordenação
- `packages/sync-daemon`
  - classificação leve
  - hashing
  - dedup
  - scheduling

### 8.2 Contrato

- `memory-mempalace` com fake `MemPalaceClient`
- validação de `memory_search`
- validação de `memory_get`
- validação de `memory_status`
- validação de `memory_index`
- validação de `memory_promote`

### 8.3 Integração

- hooks -> spool -> daemon -> MemPalace -> memory plugin
- config examples -> load -> validação -> execução mínima
- context engine com e sem Active Memory
- host OpenClaw real com `memory-only`
- host OpenClaw real com `recommended`
- host OpenClaw real com `full` quando suportado

### 8.4 Prova Observável de Recall Automático

- ingestão de memória conhecida no MemPalace
- prompt posterior que depende dessa memória
- validação de que a recuperação ocorreu antes da resposta principal
- validação de que não houve skill explícita acionada pelo usuário
- execução obrigatória em `recommended` ou `full`

### 8.5 Regressão Semântica

- fatos duráveis
- conversas
- artefatos externos
- recência conflitante
- múltiplas fontes com conteúdo sobreposto

### 8.6 Invariantes

- hooks não fazem recall principal
- memória durável não é resumida como source of truth
- contexto não injeta material sem provenance
- `memory_index` não é no-op
- context engine é opcional, memory plugin não
- compatibilidade do host não é inferida apenas por docs

---

## 9. Defaults Operacionais

- Path de spool local deve ser configurável, com default seguro fora de arquivos versionados.
- `sync.db` deve ter localização configurável.
- Todo JSON de config deve ser validado por schema antes do uso.
- Logs devem ser estruturados e suficientes para auditar ingestão, refresh e falhas.
- Toda integração com MemPalace deve permitir substituição por fake em teste.

---

## 10. Não-Objetivos Explícitos

- Não transformar o projeto em wrapper genérico multi-backend.
- Não usar hooks como motor principal de recall pré-resposta.
- Não depender de serviços remotos obrigatórios além do próprio backend MemPalace conforme necessidade do projeto.
- Não introduzir sumários como armazenamento primário de verdade.
- Não bloquear o loop de chat com mineração/classificação pesada inline.

---

## 11. Tabela de Status por Fase

| Fase | Nome | Status inicial | Saída principal |
|---|---|---|---|
| 0 | Bootstrap do monorepo | concluída | base buildável/testável |
| 0A | Validação host-real do seam | concluída | compatibilidade pinada e auditável |
| 1 | Documentação-base obrigatória | concluída | docs operacionais completos |
| 2 | `packages/shared` | concluída | contratos e schemas canônicos |
| 3 | `packages/memory-mempalace` | concluída | runtime replacement funcional |
| 4 | Hooks + spool + ingest básico | não iniciada | captura assíncrona ponta a ponta |
| 5 | Context engine + Active Memory | não iniciada | injeção disciplinada de contexto e prova de recall |
| 6 | Sync daemon + skill + infra | não iniciada | ingestão contínua operacional |
| 7 | Robustez, ranking e failure modes | não iniciada | qualidade e resiliência |
| 8 | Recursos avançados V2 | não iniciada | KG, pinned memory, diaries |
| 9 | Scripts, CI e readiness | não iniciada | operação e manutenção previsíveis |

---

## 12. Tabela de Dependências Cruzadas

| Artefato / Subsistema | Depende de | Bloqueia |
|---|---|---|
| `package.json` raiz e workspace | `SPEC`, `REASONING` | todos os packages |
| `docs/COMPATIBILITY_MATRIX.md` | bootstrap, host real | roadmap executável com risco controlado |
| `docs/TEST_STRATEGY.md` | bootstrap, host real | testes consistentes e prova de recall |
| docs operacionais | bootstrap | implementação segura dos packages |
| `packages/shared` | docs operacionais, compat matrix | todos os packages executáveis |
| `packages/memory-mempalace` | `shared`, compat matrix | context engine, hooks, exemplos |
| hooks/spool | `shared`, runtime core | fluxo de ingest v1 |
| `packages/context-engine-mempalace` | runtime core, compat matrix | injeção pré-resposta de alta qualidade |
| Active Memory enablement | runtime core, docs, eventualmente context engine | runtime conversacional completo |
| `packages/sync-daemon` | `shared`, hooks/spool | skill, infra, sync contínuo |
| `packages/skill-mempalace-sync` | daemon, shared | operação do usuário |
| `infra/systemd` / `infra/cron` | daemon | agendamento recorrente |
| examples | schemas e packages correspondentes | smoke tests e onboarding |
| host-real harnesses | runtime core, context engine, compat matrix | completion criteria fortes |
| scripts e CI | bootstrap + packages + examples + host harnesses | readiness final |

---

## 13. Critério Global de Conclusão do Repositório

O repositório estará funcionalmente pronto quando, ao mesmo tempo:

- existir pelo menos uma versão OpenClaw pinada e validada em `docs/COMPATIBILITY_MATRIX.md`;
- `memory-mempalace` puder ser ativado como slot oficial de memória;
- o slot `memory-mempalace` tiver sido carregado em um host OpenClaw real;
- o runtime expuser `memory_search`, `memory_get`, `memory_status`, `memory_index` e `memory_promote`;
- `claw-context-mempalace` tiver caminho testado em host OpenClaw real;
- o Active Memory estiver funcionando na versão-alvo ou precisamente documentado para essa versão;
- os modos `memory-only`, `recommended` e `full` tiverem config, smoke test e limitações documentadas;
- houver prova observável de recall automático pré-resposta em `recommended` ou `full`;
- hooks capturarem sem bloquear e alimentarem um pipeline de ingestão auditável;
- o daemon sincronizar fontes externas com deduplicação e refresh;
- existirem testes host-real além dos testes unitários, de contrato e de integração isolada;
- examples e docs permitirem onboarding local completo;
- a suíte de testes cobrir contratos, integração e invariantes essenciais.

---

## 14. Regra Final de Execução

Se surgir conflito entre conveniência local e aderência ao modelo arquitetural:

- escolher o `SPEC.md`;
- usar o `REASONING.md` para interpretar a intenção arquitetural;
- atualizar docs operacionais antes ou junto com mudanças de comportamento;
- não sacrificar o papel do plugin de memória como runtime replacement.

Este roadmap deve ser tratado como o plano mestre de implementação até que o `SPEC.md` ou o `REASONING.md` mudem materialmente.
