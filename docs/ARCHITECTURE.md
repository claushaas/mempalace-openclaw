# ARCHITECTURE.md

## Objetivo

Este documento descreve a arquitetura operacional alvo do repositório `mempalace-openclaw`.

Ele deriva seu escopo de [SPEC.md](SPEC.md) e suas restrições conceituais de [REASONING.md](REASONING.md). Quando houver diferença entre intenção arquitetural e comportamento já provado em host real, o comportamento validado em [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md) prevalece para execução.

## Princípios Arquiteturais

- `memory-mempalace` é um runtime replacement via `plugins.slots.memory`, não uma skill auxiliar.
- MemPalace é a source of truth durável; resumos, caches e contexto injetado não substituem o storage real.
- Hooks existem para captura, spool, enqueue e refresh trigger. Eles não são o mecanismo principal de recall pré-resposta.
- `claw-context-mempalace` é responsável por context injection disciplinada, não por storage durável.
- Active Memory é o caminho preferido para recall automático forte quando o seam do host estiver operacionalmente disponível.
- Ingestão, retrieval e context injection são responsabilidades distintas e não devem ser colapsadas em uma única camada.
- O host OpenClaw real é a referência final de compatibilidade; documentação oficial sem prova executável não basta.

## Componentes e Ownership

- OpenClaw host
  - carrega plugins, resolve slots, executa o loop de conversa e expõe os seams reais do runtime.
- `memory-mempalace`
  - adapta OpenClaw ao MemPalace como runtime de memória.
  - ownership: retrieval, lookup, status, promote, index trigger e normalização de resultados para o host.
- `claw-context-mempalace`
  - pede recall ao runtime, compõe blocos de contexto, aplica budget e injeta contexto no formato canônico.
  - ownership: context injection.
- Active Memory
  - executa, quando suportado pelo host, um pass automático pré-resposta para recall forte.
  - ownership: orchestration de pre-reply recall, não storage durável.
- hooks
  - capturam eventos da sessão e produzem envelopes normalizados.
  - ownership: captura e enqueue-only em spool.
- sync daemon
  - sincroniza fontes externas, mantém `sync.db`, processa spool e dispara refresh do runtime.
  - ownership: ingestão operacional e sincronização.
- MemPalace
  - storage durável de memória factual, conversacional e artefatos externos.
  - ownership: persistência, busca, recuperação por id e operações de promote/write.

## Fluxos End-to-End

### Runtime textual

```text
OpenClaw host
  -> memory slot: memory-mempalace
    -> MemPalace
  -> context engine slot: claw-context-mempalace
    -> consulta memory-mempalace
    -> monta contexto com provenance
  -> Active Memory (quando habilitado no host-alvo)
    -> aciona recall automático pré-resposta
  -> hooks
    -> exportam eventos para spool
  -> sync daemon
    -> processa spool e fontes externas
    -> escreve no MemPalace
    -> dispara refresh de runtime
```

### Ingest textual

```text
evento/hook
  -> normalização
  -> spool local append-only
  -> sync daemon
  -> MemPalace
  -> refresh de runtime
```

### Separação explícita de responsabilidades

- ingestão
  - captura eventos, normaliza payloads, persiste envelopes em spool, sincroniza fontes externas e escreve no MemPalace.
- retrieval
  - resolve consultas contra MemPalace por meio do `memory-mempalace`, preservando provenance e sem resumir o storage para servir como source of truth.
- context injection
  - seleciona, poda e ordena resultados para inserção no prompt, sem alterar o storage durável.

## Modos Operacionais

- `memory-only`
  - composição: OpenClaw host + `memory-mempalace`.
  - objetivo: replacement básico do runtime de memória.
  - limitação: recall automático forte continua fraco sem context engine e sem Active Memory.
- `recommended`
  - composição: OpenClaw host + `memory-mempalace` + `claw-context-mempalace`.
  - objetivo: recall pré-resposta observável via context injection disciplinada.
  - estado atual: validado com prova observável de recall pré-resposta.
- `full`
  - composição: OpenClaw host + `memory-mempalace` + `claw-context-mempalace` + Active Memory.
  - objetivo: recall automático forte com blocking pre-reply path quando suportado pelo host-alvo.
  - estado atual: Active Memory está `partially_validated` no host canônico.

## Dependências Entre Subsystems

- `memory-mempalace` depende do seam real `plugins.slots.memory` validado em host.
- `claw-context-mempalace` depende de `memory-mempalace` para retrieval e do seam `plugins.slots.contextEngine`.
- Active Memory depende do seam `plugins.entries.active-memory` e de uma estratégia de cooperação com runtime e context engine.
- hooks dependem do ciclo de vida do host, mas não do retrieval composer.
- sync daemon depende de hooks e de fontes externas, mas escreve no MemPalace sem passar pelo context engine.
- `sync.db` é dependência operacional do sync daemon, não do storage MemPalace.

## Limites Arquiteturais

- hooks não executam retrieval pesado, nem classificação cara inline.
- o memory slot não deve colapsar lógica de ingestão, sync e prompt assembly em uma única camada.
- o context engine não é storage e não substitui o runtime de memória.
- caches, resumos e blocos de prompt são derivados descartáveis; não substituem MemPalace.
- compatibilidade real com OpenClaw precisa ser mantida por validação host-real, não apenas por adesão textual ao spec.

## v1 obrigatório

- `plugins.slots.memory = "memory-mempalace"` como runtime replacement.
- MemPalace como source of truth durável.
- separação explícita entre ingestão, retrieval e context injection.
- hooks leves para captura e refresh trigger.
- documentação operacional suficiente para implementar os packages sem ambiguidade estrutural.

## recomendado

- `plugins.slots.contextEngine = "claw-context-mempalace"`.
- formato único de contexto com provenance preservada.
- smoke tests por modo operacional.
- prova observável de recall automático em `recommended`.

## v2

- Active Memory plenamente operacional em modo `full`.
- knowledge graph opcional.
- pinned memory e query expansion.
- agent diaries e compaction mais sofisticados.

## não-objetivos

- transformar hooks em mecanismo primário de recall.
- usar resumos como storage primário.
- acoplar o storage do MemPalace ao schema interno de `sync.db`.
- declarar compatibilidade host-real sem harness executado.

## Referências

- [SPEC.md](SPEC.md)
- [REASONING.md](REASONING.md)
- [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md)
- [TEST_STRATEGY.md](TEST_STRATEGY.md)
