# mempalace-openclaw

Runtime replacement de memória para OpenClaw usando MemPalace como source of truth durável.

## Objetivo

Este repositório existe para entregar:

- um plugin real de memory slot: `memory-mempalace`
- um plugin real de context engine: `claw-context-mempalace`
- um caminho documentado e, quando suportado, implementado para Active Memory
- ingestão operacional de fontes externas
- recall automático observável em modos suportados

## Modos Operacionais

- `memory-only`
  - config: [examples/openclaw.config.memory-only.json](examples/openclaw.config.memory-only.json)
  - foco: runtime replacement básico
- `recommended`
  - config: [examples/openclaw.config.recommended.json](examples/openclaw.config.recommended.json)
  - foco: memory plugin + context engine
- `full`
  - config: [examples/openclaw.config.full.json](examples/openclaw.config.full.json)
  - foco: memory plugin + context engine + Active Memory
- `advanced`
  - config: [examples/openclaw.config.advanced.json](examples/openclaw.config.advanced.json)
  - foco: extensões opcionais de V2, como `Knowledge Graph`, `pinned memory`, `query expansion`, `agent diaries` e `compaction` transitória

O status real de cada modo deve ser consultado em [docs/COMPATIBILITY_MATRIX.md](docs/COMPATIBILITY_MATRIX.md).

## Arquitetura Resumida

```text
OpenClaw host
  -> plugins.slots.memory = memory-mempalace
    -> MemPalace
  -> plugins.slots.contextEngine = claw-context-mempalace
    -> consulta o runtime de memória
    -> injeta contexto com provenance
  -> plugins.entries.active-memory
    -> recall automático forte quando suportado
  -> hooks
    -> spool local append-only
    -> enqueue-only a partir da Etapa 6
  -> sync-daemon
    -> owner operacional do spool e de `sync.db`
    -> processa spool e fontes externas
    -> atualiza MemPalace e dispara refresh
```

Separação de responsabilidades:

- ingestão
  - hooks, spool e sync daemon.
- retrieval
  - `memory-mempalace` consultando o MemPalace.
- context injection
  - `claw-context-mempalace` e, em modo `full`, cooperação com Active Memory.

## Packages Planejados

| Package | Responsabilidade | Status atual |
| --- | --- | --- |
| `memory-mempalace` | plugin real de memory slot e adapter entre OpenClaw e MemPalace | implementado |
| `context-engine-mempalace` | plugin real de context engine para budget, pruning e injeção com provenance | implementado |
| `shared` | tipos, schemas e contratos comuns do runtime, hooks e sync | implementado |
| `mempalace-ingest-hooks` | hook pack real para captura e enqueue em spool local | implementado |
| `sync-daemon` | ingestão operacional, `sync.db`, spool e sincronização de fontes externas | implementado |
| `skill-mempalace-sync` | surface operacional para adicionar, listar, rodar e reindexar sources | implementado |

## Documentos Canônicos

- [docs/SPEC.md](docs/SPEC.md)
- [docs/REASONING.md](docs/REASONING.md)
- [docs/development/ROADMAP.md](docs/development/ROADMAP.md)

## Documentos Operacionais

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DB_SCHEMA.md](docs/DB_SCHEMA.md)
- [docs/HOOKS.md](docs/HOOKS.md)
- [docs/MEMORY_RUNTIME.md](docs/MEMORY_RUNTIME.md)
- [docs/CONTEXT_ENGINE.md](docs/CONTEXT_ENGINE.md)
- [docs/ACTIVE_MEMORY.md](docs/ACTIVE_MEMORY.md)
- [docs/MEMORY_PROTOCOL.md](docs/MEMORY_PROTOCOL.md)
- [docs/COMPATIBILITY_MATRIX.md](docs/COMPATIBILITY_MATRIX.md)
- [docs/TEST_STRATEGY.md](docs/TEST_STRATEGY.md)

## Bootstrap Local

Pré-requisitos:

- `Node.js v24.13.1`
- `pnpm 10.33.0`

### Onde clonar o repositório

Este repositório não precisa ser clonado em um path fixo.

Pode ser clonado em qualquer diretório local estável e gravável, por exemplo:

- `~/dev/mempalace-openclaw`
- `~/src/mempalace-openclaw`
- `/Volumes/data/dev/mempalace-openclaw`

Evite clonar em:

- `~/.openclaw/`
- `~/.openclaw/workspace/`
- dentro de `.tmp/` do próprio projeto
- diretórios efêmeros, sincronizados automaticamente ou sujeitos a limpeza agressiva

Motivo:

- o repositório é o workspace de desenvolvimento;
- o OpenClaw mantém estado operacional separado em `OPENCLAW_STATE_DIR` ou, por default, em `~/.openclaw`;
- os harnesses e instaladores deste projeto já usam `.tmp/` para staging temporário e host isolado;
- misturar checkout do repositório com state dir do host aumenta o risco de conflito, limpeza acidental e paths confusos na instalação linkada.

Fluxo recomendado:

```sh
git clone https://github.com/claushaas/mempalace-openclaw.git ~/dev/mempalace-openclaw
cd ~/dev/mempalace-openclaw
pnpm setup
```

Quickstart:

- `pnpm setup`
- `pnpm build`
- `pnpm test`
- `pnpm smoke:examples`

Scripts da raiz:

- `pnpm setup`
- `pnpm build`
- `pnpm test`
- `pnpm lint`
- `pnpm lint:check`
- `pnpm lint:fix`
- `pnpm typecheck`
- `pnpm dev`
- `pnpm validate-config`
- `pnpm smoke:examples`
- `pnpm diagnostic:stage7`
- `pnpm benchmark:stage7`

O bootstrap do monorepo já está concluído. Nesta altura do roadmap, `shared`, `memory-mempalace`, `context-engine-mempalace`, `mempalace-ingest-hooks`, `sync-daemon` e `skill-mempalace-sync` já existem.

## Development Workflow

- `pnpm dev`
  - watch dos builds de `shared`, `memory-mempalace`, `context-engine-mempalace`, `sync-daemon` e `skill-mempalace-sync`
- `pnpm dev tests`
  - `vitest --watch`
- `pnpm dev all`
  - watch dos packages e dos testes em paralelo
- `pnpm dev daemon -- run --once`
  - watch do binário do `sync-daemon` com repasse de argumentos

## Como Usar os Examples

Os arquivos em `examples/` são templates operacionais, não configs prontas para produção.

Antes de usar qualquer example:

- copie o arquivo para uma config local fora do versionamento;
- troque paths absolutos de placeholder;
- ajuste variáveis de ambiente do backend MemPalace;
- valide a config com `pnpm validate-config` ou `pnpm smoke:examples`.

Exemplo de preparação do modo `recommended`:

```sh
cp ./examples/openclaw.config.recommended.json ./openclaw.local.json
```

Trecho que precisa ser ajustado:

```json
{
  "plugins": {
    "entries": {
      "memory-mempalace": {
        "config": {
          "command": "node",
          "args": ["/absolute/path/to/mempalace-mcp-server.mjs"],
          "env": {
            "MEMPALACE_ENDPOINT": "replace-me"
          }
        }
      }
    }
  }
}
```

Exemplos de source também exigem edição do campo `path`:

- `examples/obsidian-source.json`
- `examples/repo-source.json`

Exemplo de preparação de um source local:

```sh
cp ./examples/repo-source.json ./repo-source.local.json
```

Depois ajuste:

- `path`
- `include` / `exclude`
- `schedule`
- `defaults.wing` e `defaults.hall`, se fizer sentido no seu ambiente

## Instalação no OpenClaw

Este repositório não distribui plugins publicados em registry externo. Em `openclaw@2026.4.15`, o caminho suportado neste repositório é instalar os packages locais por meio do staging seguro fornecido por `pnpm openclaw:install-local-package`.

### Skill de Onboarding Para o End User

Este repositório também distribui uma skill instrucional para ajudar o agente a orientar instalação, configuração e uso operacional deste projeto no OpenClaw:

- `skills/mempalace-openclaw-onboarding/`

Essa skill não adiciona runtime nem comandos novos. Ela ensina o agente a:

- instalar os packages locais do repositório no host;
- escolher entre `memory-only`, `recommended`, `full` e `advanced`;
- configurar os examples versionados corretamente;
- usar `mempalace-sync`, validar setup e explicar limitações reais.

### Como instalar a skill no ambiente local

Use o script do repositório para copiar a skill para um diretório de skills escolhido:

```sh
pnpm skill:copy:onboarding -- "${CODEX_HOME:-$HOME/.codex}/skills"
```

Se você omitir o argumento, o script usa:

- `${CODEX_HOME}/skills`, quando `CODEX_HOME` estiver definido;
- `~/.codex/skills`, caso contrário.

Exemplo sem argumento explícito:

```sh
pnpm skill:copy:onboarding
```

O script copia `skills/mempalace-openclaw-onboarding/` para o diretório alvo, substituindo apenas a cópia anterior dessa mesma skill no destino.

Depois recarregue ou reinicie o ambiente do agente, se o cliente atual exigir isso para redescobrir skills locais.

### Quando usar a skill

Use essa skill quando o usuário pedir ajuda para:

- instalar `mempalace-openclaw`;
- configurar o OpenClaw para usar os plugins do repositório;
- escolher o modo operacional correto;
- operar `mempalace-sync`;
- validar setup, config, recall ou sync.

Exemplo de prompt:

```text
Use $mempalace-openclaw-onboarding para me guiar na instalação e configuração do mempalace-openclaw no OpenClaw, começando pelo modo recommended.
```

### 1. Preparar o repositório

```sh
pnpm setup
```

Isso garante:

- dependências instaladas;
- build inicial dos packages;
- validação dos examples;
- diretórios temporários operacionais preparados.

### 2. Instalar os packages no host

Instalação mínima do runtime de memória:

```sh
pnpm openclaw:install-local-package -- ./packages/memory-mempalace
```

Instalação recomendada para recall automático observável:

```sh
pnpm openclaw:install-local-package -- ./packages/memory-mempalace
pnpm openclaw:install-local-package -- ./packages/context-engine-mempalace
```

Instalação do plugin de comandos operacionais de sync:

```sh
pnpm openclaw:install-local-package -- ./packages/skill-mempalace-sync
```

Instalação do hook pack de captura/enqueue:

```sh
pnpm openclaw:install-local-package -- ./packages/mempalace-ingest-hooks
```

Observações:

- o script cria uma cópia staged e dereferenciada em `.tmp/openclaw-linked-installs/` para contornar o safety scan novo do host;
- `memory-mempalace` é o package obrigatório para uso real do projeto;
- `context-engine-mempalace` é o complemento recomendado para recall pré-resposta;
- `skill-mempalace-sync` e `mempalace-ingest-hooks` são complementos operacionais, não pré-requisitos do modo `memory-only`;
- `active-memory` não é instalado por este repositório; ele é um plugin bundled do próprio OpenClaw quando a versão-alvo o fornece.

### 3. Confirmar a instalação

Depois do link install, valide discovery e estado:

```sh
pnpm exec openclaw plugins inspect memory-mempalace --json
pnpm exec openclaw plugins inspect claw-context-mempalace --json
pnpm exec openclaw plugins inspect skill-mempalace-sync --json
```

Para o hook pack:

```sh
pnpm exec openclaw hooks list --json
```

## Configuração no OpenClaw

### 1. Escolher um modo

Use um dos arquivos:

- `examples/openclaw.config.memory-only.json`
- `examples/openclaw.config.recommended.json`
- `examples/openclaw.config.full.json`
- `examples/openclaw.config.advanced.json`

Fluxo sugerido:

```sh
cp ./examples/openclaw.config.recommended.json ./openclaw.local.json
```

### 2. Ajustar o backend MemPalace

O bloco mínimo do `memory-mempalace` precisa apontar para um servidor MCP real do MemPalace via `stdio`.

Exemplo:

```json
{
  "plugins": {
    "entries": {
      "memory-mempalace": {
        "enabled": true,
        "config": {
          "transport": "stdio",
          "command": "node",
          "args": ["/absolute/path/to/mempalace-mcp-server.mjs"],
          "cwd": "/absolute/path/to/mempalace-backend",
          "env": {
            "MEMPALACE_ENDPOINT": "replace-me"
          },
          "timeoutMs": 5000,
          "defaultTokenBudget": 1200,
          "defaultResultLimit": 8
        }
      }
    },
    "slots": {
      "memory": "memory-mempalace"
    }
  }
}
```

Campos que normalmente precisam de edição:

- `args`
- `cwd`
- `env`
- `timeoutMs`, se o backend local for mais lento

### 3. Ativar o context engine

No modo `recommended`, adicione ou preserve:

```json
{
  "plugins": {
    "entries": {
      "claw-context-mempalace": {
        "enabled": true,
        "config": {
          "maxEntries": 6,
          "maxContextTokens": 1200,
          "minScore": 0.15,
          "maxArtifactLines": 40,
          "includeMemoryPromptAddition": true
        }
      }
    },
    "slots": {
      "contextEngine": "claw-context-mempalace"
    }
  }
}
```

### 4. Ativar o modo `full`

O modo `full` exige manter o modo `recommended` e habilitar o plugin bundled `active-memory`:

```json
{
  "plugins": {
    "entries": {
      "active-memory": {
        "enabled": true,
        "config": {
          "enabled": true,
          "allowedChatTypes": ["direct"],
          "queryMode": "recent",
          "promptStyle": "recall-heavy",
          "timeoutMs": 15000
        }
      }
    }
  }
}
```

Limite atual:

- o repositório suporta esse shape e o host sobe com ele;
- em `openclaw@2026.4.15`, a prova observável do pass próprio de Active Memory ainda continua `partially_validated`.

### 5. Validar a config antes do uso

Para validar os templates do repositório:

```sh
pnpm validate-config
pnpm smoke:examples
```

Para validar uma config local no host:

```sh
OPENCLAW_CONFIG_PATH=./openclaw.local.json \
pnpm exec openclaw config validate --json
```

## Uso no Dia a Dia

### 1. Usar apenas o runtime de memória

Esse modo é útil para smoke do replacement runtime e para ambientes em que você ainda não quer context injection:

```sh
OPENCLAW_CONFIG_PATH=./openclaw.local.json \
pnpm exec openclaw agent --local --message "Test memory runtime boot"
```

Para prova operacional do modo:

```sh
pnpm host-real:smoke:memory-only
```

### 2. Usar o modo recomendado

Esse é o modo principal do projeto.

Quando a config local estiver pronta:

```sh
OPENCLAW_CONFIG_PATH=./openclaw.local.json \
pnpm exec openclaw agent --local --message "What did we decide earlier about the runtime backend?"
```

Para a prova canônica do repositório:

```sh
pnpm host-real:recommended-recall
```

### 3. Usar as funcionalidades de sync

Você pode operar o sync de duas formas.

Via binário direto do daemon:

```sh
OPENCLAW_CONFIG_PATH=./openclaw.local.json \
pnpm --filter @mempalace-openclaw/sync-daemon exec mempalace-sync-daemon add-source \
  --config ./repo-source.local.json \
  --json

OPENCLAW_CONFIG_PATH=./openclaw.local.json \
pnpm --filter @mempalace-openclaw/sync-daemon exec mempalace-sync-daemon run \
  --source-id repo-main \
  --json
```

Via plugin de comandos já instalado no OpenClaw:

- `mempalace_sync_add_source`
- `mempalace_sync_list_sources`
- `mempalace_sync_run`
- `mempalace_sync_status`
- `mempalace_sync_remove_source`
- `mempalace_sync_reindex`

E via root CLI registrada pelo plugin:

```sh
pnpm exec openclaw mempalace-sync list-sources --json
pnpm exec openclaw mempalace-sync run --source-id repo-main --json
pnpm exec openclaw mempalace-sync status --json
```

### 4. Usar extensões opcionais de V2

O modo `advanced` ativa:

- `Knowledge Graph`
- `pinned memory`
- `query expansion`
- `agent diaries`
- `compaction` transitória

Esses recursos:

- ficam desligados por default;
- não criam nova surface principal `memory_*`;
- degradam de forma observável quando o backend MCP não expõe as tools opcionais.

Para validar o caminho avançado:

```sh
pnpm host-real:advanced-recall
```

## Fluxos Comuns

### 1. Validar ambiente e examples

```sh
pnpm setup
pnpm smoke:examples
```

Esse é o caminho mínimo para confirmar que:

- dependências estão instaladas;
- builds passam;
- os examples JSON e `SourceConfig` estão válidos;
- `openclaw config validate --json` aceita os modos operacionais em ambiente temporário isolado.

### 2. Rodar a prova canônica de recall

```sh
pnpm host-real:recommended-recall
```

Use esse harness quando quiser responder à pergunta operacional mais importante do projeto:

- o runtime de memória final carrega;
- o context engine final monta contexto antes da resposta;
- a recuperação acontece sem skill explícita do usuário.

### 3. Rodar apenas smoke tests por modo

```sh
pnpm host-real:smoke:memory-only
pnpm host-real:smoke:recommended
pnpm host-real:smoke:full
```

Use esses comandos para verificar bootstrap e carregamento por modo, sem exigir a prova completa de recall.

### 4. Operar o sync-daemon diretamente

O binário do package `sync-daemon` pode ser usado sem passar pelo plugin de comandos.

Exemplo de listagem de subcomandos:

```sh
pnpm --filter @mempalace-openclaw/sync-daemon exec mempalace-sync-daemon
```

Exemplo de cadastro e execução de uma fonte:

```sh
OPENCLAW_CONFIG_PATH=./openclaw.local.json \
pnpm --filter @mempalace-openclaw/sync-daemon exec mempalace-sync-daemon add-source \
  --config ./repo-source.local.json \
  --json

OPENCLAW_CONFIG_PATH=./openclaw.local.json \
pnpm --filter @mempalace-openclaw/sync-daemon exec mempalace-sync-daemon run \
  --source-id repo-main \
  --json
```

Exemplo de inspeção de status:

```sh
OPENCLAW_CONFIG_PATH=./openclaw.local.json \
pnpm --filter @mempalace-openclaw/sync-daemon exec mempalace-sync-daemon status \
  --json
```

Observações:

- `OPENCLAW_CONFIG_PATH` precisa apontar para uma config que contenha `plugins.entries.memory-mempalace.config`;
- o daemon lê desse arquivo a resolução do backend MCP;
- `repo-main` é apenas o `id` do example padrão; use o valor real do seu source config.

### 5. Rodar diagnósticos locais reproduzíveis

```sh
pnpm diagnostic:stage7
pnpm benchmark:stage7
```

Esses comandos usam o corpus fixo de `fixtures/stage7/` e gravam saídas em `.tmp/diagnostics/`.

## Exemplos de Uso por Modo

### `memory-only`

Quando usar:

- para validar o runtime replacement isoladamente;
- para smoke de slot de memória;
- para cenários em que recall automático forte não é requisito.

Comando típico:

```sh
pnpm host-real:smoke:memory-only
```

### `recommended`

Quando usar:

- como baseline operacional do projeto;
- para validação real de recall automático pré-resposta;
- para regressão principal do repositório.

Comandos típicos:

```sh
pnpm host-real:smoke:recommended
pnpm host-real:recommended-recall
```

### `full`

Quando usar:

- para medir a convivência com `active-memory` na versão-alvo;
- para observar o estado real do seam do host.

Comandos típicos:

```sh
pnpm host-real:smoke:full
pnpm host-real:full-recall
```

Limite atual:

- o modo `full` continua `partially_validated` em `openclaw@2026.4.15`.

### `advanced`

Quando usar:

- para exercitar extensões opcionais de V2;
- para validar degradação limpa quando as capabilities MCP extras existem ou não.

Comando típico:

```sh
pnpm host-real:advanced-recall
```

## Validação Host-Real

A Etapa 0A já materializa o seam real do host contra `openclaw@2026.4.15`.

Scripts disponíveis:

- `pnpm host-real:bootstrap`
- `pnpm host-real:manifest`
- `pnpm host-real:memory-slot`
- `pnpm host-real:memory-mempalace`
- `pnpm host-real:mempalace-ingest-hooks`
- `pnpm host-real:context-slot`
- `pnpm host-real:context-engine-mempalace`
- `pnpm host-real:active-memory`
- `pnpm host-real:smoke:memory-only`
- `pnpm host-real:smoke:recommended`
- `pnpm host-real:smoke:full`
- `pnpm host-real:advanced-recall`
- `pnpm host-real:recommended-recall`
- `pnpm host-real:full-recall`
- `pnpm host-real:skill-mempalace-sync`
- `pnpm host-real:sync-filesystem`
- `pnpm host-real:sync-git`
- `pnpm host-real:sync-spool-cutover`
- `pnpm host-real:sync-stage6`
- `pnpm host-real:all`

Artefatos relevantes:

- probes: `fixtures/host-real/probe-memory-slot`, `fixtures/host-real/probe-context-engine-slot`
- shim MCP local para smoke do backend: `fixtures/host-real/mempalace-mcp-shim.mjs`
- host temporário: `.tmp/openclaw-host/`
- relatórios temporários: `.tmp/host-real-results/`

Limite importante:

- esses probes validam o seam do OpenClaw host;
- eles não contam como implementação de `memory-mempalace` nem de `claw-context-mempalace`.
- em `openclaw@2026.4.15`, um memory slot externo substitui `memory-core`; por isso a árvore `openclaw memory` não serve como prova do seam nessa etapa.

O estado detalhado da compatibilidade está em [docs/COMPATIBILITY_MATRIX.md](docs/COMPATIBILITY_MATRIX.md).

## CI and Host-Real Validation

CI automática:

- workflow `CI`
- roda em `push` e `pull_request`
- executa:
  - `pnpm install --frozen-lockfile`
  - `pnpm lint:check`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
  - `pnpm validate-config`
  - `pnpm smoke:examples`

Host-real gated:

- workflow `Host-Real`
- runner alvo: `macos-14`
- gatilho: `workflow_dispatch`
- suites disponíveis:
  - `smoke`
  - `recommended-recall`
  - `advanced-recall`
  - `sync-stage6`
  - `full-recall`

`smoke:examples` é propositalmente leve e não substitui os harnesses `host-real:*`.

## Estado Atual

O repositório já tem bootstrap do monorepo, runtime de memória funcional, hook pack enqueue-only, `sync-daemon` operacional, skill operacional, context engine funcional com prova observável de recall no modo `recommended`, endurecimento local de ranking/cache/failure modes da Etapa 7 e extensões opcionais de V2 da Etapa 8 preservando o contrato base do runtime.

O que já está fechado:

- host canônico pinado em `openclaw@2026.4.15`
- manifest real aceito pelo host
- slot de memória validado com probe
- plugin final `memory-mempalace` implementado e validado em host real com MCP shim local
- hook pack `mempalace-ingest-hooks` implementado e validado em host real como enqueue-only no spool canônico do host state dir
- slot de context engine validado com probe
- plugin final `claw-context-mempalace` implementado e validado em host real
- `sync-daemon` implementado com `sync.db`, execução de spool, fontes `filesystem`, `git` e `documents`, e refresh operacional
- plugin `skill-mempalace-sync` implementado com os seis comandos públicos e root CLI `mempalace-sync`
- Etapa 6 validada em host real com `host-real:skill-mempalace-sync`, `host-real:sync-filesystem`, `host-real:sync-git`, `host-real:sync-spool-cutover` e `host-real:sync-stage6`
- modo `memory-only` com config real, smoke test e limitação documentada
- modo `recommended` com config real, smoke test e prova observável de recall automático sem skill explícita
- modo `full` com config real, smoke test e classificação precisa como `partially_validated`
- caminho de configuração de Active Memory investigado e classificado
- contratos operacionais documentados por subsistema
- package `@mempalace-openclaw/shared` com schemas, tipos, erros e utilidades canônicas
- ranking explícito `v2`, cache observável em `memory_status` e diagnósticos locais reproduzíveis da Etapa 7
- flags opcionais de V2 em `memory-mempalace` e `claw-context-mempalace`
- `Knowledge Graph` opcional por MCP, com fallback limpo quando as tools não existem
- `pinned memory`, `query expansion`, `agent diaries` e `compaction` transitória validados em `pnpm host-real:advanced-recall`
- scripts operacionais `pnpm setup`, `pnpm dev`, `pnpm validate-config` e `pnpm smoke:examples`
- workflow `CI` para checks base em `push`/`pull_request`
- workflow `Host-Real` manual gated em `macos-14` com upload dos artifacts de `.tmp/host-real-results/`

O que ainda não existe:

- validação positiva do pass próprio de Active Memory antes da resposta principal em `openclaw@2026.4.15`
- fontes `chat-export` no pipeline operacional do `sync-daemon`

## Readiness Checklist

- `pnpm setup` prepara ambiente, instala dependências e valida configs
- `pnpm test`, `pnpm typecheck` e `pnpm build` passam localmente
- `pnpm smoke:examples` valida os examples e os source configs
- `pnpm host-real:recommended-recall` continua sendo o caminho canônico de aceite host-real
- o modo `full` continua corretamente classificado como `partially_validated`

Limites relevantes já observados:

- o harness canônico de aceite da Etapa 5 é `pnpm host-real:recommended-recall`;
- no ambiente linkado do host, o seam público `listActiveMemoryPublicArtifacts(...)` pode não refletir o provider do memory slot final, então o `claw-context-mempalace` usa esse seam como primeira tentativa e cai para o mirror público em disco do `memory-mempalace` quando necessário;
- as extensões avançadas de V2 são todas opcionais e ficam desligadas por default; o runtime base continua funcional sem `Knowledge Graph`, sem diaries e sem compaction;
- em `openclaw@2026.4.15`, o modo `full` inicializa corretamente com `active-memory`, mas o pass pré-resposta próprio do Active Memory ainda não ficou observável com `memory_search` + `memory_get` em transcript. Por isso o status correto continua `partially_validated`.
