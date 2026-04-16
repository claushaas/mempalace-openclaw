# ACTIVE_MEMORY.md

## Objetivo

Este documento registra o papel, o enablement e os limites atuais de Active Memory no host-alvo.

Ele existe para separar com clareza o que já foi validado em host real do que ainda é apenas contrato alvo derivado de [SPEC.md](SPEC.md) e [REASONING.md](REASONING.md).

## Papel do Active Memory

- executar, quando disponível, um pass automático pré-resposta para recall forte;
- cooperar com o runtime de memória e com o context engine;
- melhorar o comportamento automático do modo `full`.

Regra arquitetural:

- Active Memory não substitui MemPalace como source of truth.
- Active Memory também não substitui `memory-mempalace`; ele orquestra recall, não storage durável.

## Seam Validado no Host-Alvo

Versão canônica:

- `openclaw@2026.4.14`

Surface validada:

- `plugins.entries.active-memory`

Estado atual:

- `partially_validated`

O que já foi validado:

- config aceita pelo host;
- bootstrap do host com a surface habilitada;
- presença do plugin bundled correspondente.

O que ainda não foi provado:

- um pass próprio e observável de `active-memory` antes da resposta principal com `memory_search` + `memory_get` registrados em transcript;
- cooperação operacional completa com `memory-mempalace` e `claw-context-mempalace` sem depender apenas do context engine.

## Enablement

Enablement alvo:

- configurar `plugins.entries.active-memory` no host-alvo;
- usar o modo `full` com `memory-mempalace` e `claw-context-mempalace`;
- validar o comportamento por harness observável, não apenas por bootstrap.

Estado atual do enablement em `openclaw@2026.4.14`:

- `plugins.entries.active-memory.enabled = true` funciona;
- `plugins.entries.active-memory.config.enabled = true` funciona;
- o modo `full` sobe com `memory-mempalace` + `claw-context-mempalace` + `active-memory`;
- o harness `pnpm host-real:smoke:full` passa;
- o harness `pnpm host-real:full-recall` retorna `partially_validated`, porque a resposta correta ainda não veio acompanhada de transcript observável do pass próprio de Active Memory.

## Interação com Memory Runtime

- Active Memory deve consultar o runtime `memory-mempalace` para recuperar memória relevante.
- o runtime continua sendo a fronteira oficial com o MemPalace.
- o context engine já cobre o caminho canônico de recall automático em `recommended`.
- Active Memory não deve manter uma verdade paralela fora do backend durável.

## Interação com Context Engine

- Active Memory é preferido para um pass próprio de recall automático forte quando isso estiver observável.
- `claw-context-mempalace` já é o caminho canônico validado para o modo `recommended`.
- em `full`, o context engine continua responsável por budget, pruning e formato de injeção, mesmo quando Active Memory estiver habilitado.

## Fallbacks e Degradação

- se Active Memory não estiver operacional em uma versão-alvo, o modo `recommended` continua sendo o baseline aceitável para recall automático via context engine.
- a degradação deve ser explícita em compatibilidade e smoke tests.
- nenhum documento deve afirmar `full = validated` sem transcript ou evidência equivalente do pass pré-resposta próprio.

## Limitações da Versão-Alvo

- em `2026.4.14`, a surface existe, aceita configuração e inicializa no modo `full`.
- o harness `pnpm host-real:full-recall` devolve resposta final correta, mas a evidência disponível continua vindo do `claw-context-mempalace`; o transcript esperado de `active-memory` com `memory_search` + `memory_get` antes da resposta principal não apareceu.
- por isso, o status correto permanece `partially_validated`.

## v1 obrigatório

- documentação explícita do seam `plugins.entries.active-memory`.
- classificação correta do estado atual como `partially_validated`.
- distinção entre surface validada e recall ainda não provado.
- referência aos harnesses `pnpm host-real:smoke:full` e `pnpm host-real:full-recall`.

## recomendado

- modo `full` documentado.
- cooperação planejada com runtime e context engine.
- melhoria do harness para capturar transcript do pass próprio de Active Memory assim que o host expuser essa trilha de observabilidade.

## v2

- suporte operacional completo em versões-alvo futuras.
- fallback mais fino entre modos `recommended` e `full`.
- observabilidade mais detalhada do pass pré-resposta.

## não-objetivos

- declarar Active Memory como plenamente funcional sem prova.
- usar Active Memory para substituir storage durável.
- mascarar limitações da versão-alvo.

## Referências

- [SPEC.md](SPEC.md)
- [REASONING.md](REASONING.md)
- [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md)
- [TEST_STRATEGY.md](TEST_STRATEGY.md)
