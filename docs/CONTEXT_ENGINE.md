# CONTEXT_ENGINE.md

## Objetivo

Este documento define o contrato operacional do slot `contextEngine` que será implementado por `claw-context-mempalace`.

Ele detalha o papel do engine entre retrieval e prompt assembly, usando [SPEC.md](SPEC.md) como fonte de escopo e [REASONING.md](REASONING.md) como fonte das restrições sobre recall automático e disciplina de contexto.

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

## Formato de Injeção

Formato lógico único alvo para cada entrada de contexto:

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
  "provenance": {
    "runtime": "memory-mempalace"
  }
}
```

Campos mínimos obrigatórios:

- provenance explícita;
- recency;
- source;
- classificação.

Regra:

- o formato de injeção deve ser único dentro do projeto para evitar múltiplos formatos concorrentes entre runtime, context engine e Active Memory.

## Budget e Pruning

- budget por tokens é responsabilidade do context engine.
- o engine deve selecionar os itens de maior valor informacional dentro do budget disponível.
- pruning deve remover conteúdo de menor valor.
- pruning nunca deve remover provenance.
- pruning não pode ocultar que o resultado foi resumido, truncado ou priorizado.

## Ordem de Montagem de Contexto

Ordem lógica alvo:

1. receber query ou sinal contextual do host.
2. consultar `memory-mempalace`.
3. receber resultados com provenance.
4. deduplicar ou agrupar quando necessário.
5. aplicar ordering por relevância, recency e classificação.
6. aplicar budget e pruning.
7. injetar contexto no formato canônico.

## Interação com Memory Runtime

- o context engine depende de `memory-mempalace` para retrieval.
- qualquer fallback do engine ainda precisa respeitar o runtime como fonte de recuperação.
- o engine não deve duplicar indexação, sync ou promote.

## Interação com Active Memory

- em modo `full`, Active Memory é o caminho preferido para recall automático forte.
- o context engine continua relevante para montagem e disciplina do contexto mesmo quando Active Memory existir.
- a cooperação entre Active Memory e context engine deve evitar duplicação do mesmo artefato no prompt.

## Fallbacks

- sem context engine, o modo `memory-only` continua possível, mas com recall automático mais fraco.
- se o engine falhar, o erro deve ser observável e a degradação deve ser controlada.
- fallback não deve inventar contexto sem provenance.

## v1 obrigatório

- `plugins.slots.contextEngine = "claw-context-mempalace"`.
- formato único de injeção com provenance.
- budget por tokens explícito.
- pruning sem remover provenance.

## recomendado

- uso como modo padrão em `recommended`.
- integração com prova observável de recall automático.
- sinais de recency e classificação leves no ordering.

## v2

- estratégias mais avançadas de chunk packing.
- budget adaptativo por tipo de tarefa.
- cooperação mais fina com Active Memory.

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
