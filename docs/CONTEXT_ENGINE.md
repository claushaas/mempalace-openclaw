# CONTEXT_ENGINE.md

## Objetivo

Este documento define o contrato operacional do slot `contextEngine` implementado por `claw-context-mempalace`.

Ele descreve o comportamento efetivo já entregue no repositório e separa explicitamente:

- estado atual validado em host real;
- contrato alvo que continua dependente do host ou de etapas futuras.

## Responsabilidade do Context Engine

- consultar o runtime de memória antes da resposta quando o modo operacional exigir recall automático via context injection;
- montar blocos de contexto a partir dos resultados retornados pelo `memory-mempalace`;
- aplicar budget por tokens;
- preservar provenance e classificação;
- reduzir poluição do prompt por pruning explícito.

O context engine não deve:

- persistir memória durável;
- executar ingestão;
- substituir o runtime de memória.
- compactar memória durável.

## Formato de Injeção

Formato lógico canônico para cada `ContextInjectionEntry`:

```json
{
  "artifactId": "art_123",
  "content": "texto relevante",
  "source": "project-notes",
  "sourceType": "filesystem",
  "sourcePath": "/vault/project.md",
  "updatedAt": "2026-04-15T12:00:00Z",
  "classification": "decision",
  "recency": "recent",
  "score": 0.91
}
```

Campos mínimos obrigatórios:

- `artifactId`;
- `content`;
- `source`, `sourceType`, `sourcePath`;
- `updatedAt`;
- `classification`;
- recency;
- provenance explícita no bloco textual final, não como shape aninhado separado.

Regra:

- o formato de injeção deve permanecer flattenado e compatível com `@mempalace-openclaw/shared`;
- o engine injeta um único `systemPromptAddition` estável com cabeçalho `MemPalace Recall Context`;
- o engine não cria mensagem sintética adicional no array `messages`.

## Budget e Pruning

- budget por tokens é responsabilidade do context engine.
- o engine usa `min(tokenBudget do host, maxContextTokens configurado)` quando o host fornece budget explícito.
- ordering atual:
  - score;
  - prioridade de classificação `decision > problem > milestone > artifact > conversation`;
  - recency;
  - dedupe por `artifactId` e redundância textual.
- pruning remove redundância antes de remover diversidade de fontes.
- o engine limita a no máximo `2` entradas por `source`.
- se houver ao menos um item `decision`, `problem` ou `milestone`, o bloco final não deve ficar composto apenas por `conversation`.
- pruning nunca remove provenance dos itens mantidos.

## Ordem de Montagem de Contexto

Ordem efetiva da implementação:

1. derivar `agentId` com `resolveSessionAgentId(...)`.
2. obter o search manager ativo com `getActiveMemorySearchManager(...)`.
3. se não houver manager ou prompt, degradar sem inventar contexto.
4. executar `manager.search(...)`.
5. executar `manager.readFile(...)` para os artefatos selecionados.
6. enriquecer cada item com o catálogo público do runtime de memória.
7. aplicar ordering, dedupe, budget e pruning.
8. serializar um bloco único em `systemPromptAddition`.

## Interação com Memory Runtime

- o context engine depende de `memory-mempalace` para retrieval.
- o engine consome `manager.search(...)` e `manager.readFile(...)` do runtime de memória.
- o enrichment primário usa `publicArtifacts.listArtifacts(...)`.
- no ambiente host-real linkado de `openclaw@2026.4.14`, esse seam pode não refletir o provider registrado por causa da separação de instância do SDK; por isso a implementação usa fallback explícito para o mirror público em disco mantido por `memory-mempalace`.
- o engine não duplica indexação, sync nem promote.

## Interação com Active Memory

- em modo `recommended`, `claw-context-mempalace` é o caminho canônico já validado para recall automático observável.
- em modo `full`, Active Memory continua sendo o caminho preferido para um pass próprio pré-resposta, mas o context engine permanece responsável pelo budget, pruning e formato de injeção.
- a cooperação entre Active Memory e context engine deve evitar duplicação do mesmo artefato no prompt.

## Fallbacks

- sem context engine, o modo `memory-only` continua possível, mas não é o caminho canônico para recall automático forte.
- se o engine falhar, o erro é observável em evidência JSONL e a resposta degrada para o prompt base do host.
- fallback não inventa contexto sem provenance.

Extensões opcionais entregues na Etapa 8:

- `agent diaries`
  - `afterTurn()` grava entradas append-only por `agentId` no backend MemPalace;
  - diaries ficam fora do retrieval geral por default;
  - consulta de diary só acontece quando `advanced.agentDiaries = true` e o prompt é explicitamente sobre memória anterior ou quando o recall geral é fraco.
- `compaction`
  - config pública em `plugins.entries.claw-context-mempalace.config.compaction`;
  - gera um bloco transitório `Compacted Recall Notes` quando há overflow de budget;
  - preserva provenance mínima por item compactado;
  - nunca toca artifacts duráveis no backend.

Config pública opcional:

- `compaction.enabled?: boolean`
- `compaction.maxCompactedEntries?: number`
- `compaction.overflowSummaryMaxChars?: number`

## v1 obrigatório

- `plugins.slots.contextEngine = "claw-context-mempalace"`.
- formato único de injeção com provenance.
- budget por tokens explícito.
- pruning sem remover provenance.
- harness host-real `pnpm host-real:context-engine-mempalace`.
- prova canônica de recall em `pnpm host-real:recommended-recall`.

## recomendado

- uso como modo padrão em `recommended`.
- integração com prova observável de recall automático.
- fallback documentado para o mirror público do runtime no ambiente linkado do host.

## v2

- cooperação mais fina com Active Memory.
- heurísticas mais específicas de relevância para diary por agente/subagente.
- remoção do fallback de mirror se o seam público do host passar a ser estável para plugins linkados.

## não-objetivos

- substituir o runtime de memória.
- armazenar estado durável.
- fazer ingestão de fontes externas.
- mascarar ausência de provenance para caber no prompt.

## Referências

- [SPEC.md](SPEC.md)
- [REASONING.md](REASONING.md)
- [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md)
- [TEST_STRATEGY.md](TEST_STRATEGY.md)
