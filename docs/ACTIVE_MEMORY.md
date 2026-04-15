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

- blocking pre-reply recall ponta a ponta com MemPalace real;
- cooperação operacional completa com `memory-mempalace` e `claw-context-mempalace`.

## Enablement

Enablement alvo:

- configurar `plugins.entries.active-memory` no host-alvo;
- usar o modo `full` com `memory-mempalace` e `claw-context-mempalace`;
- validar o comportamento por harness observável, não apenas por bootstrap.

Nesta etapa, o enablement documentado é real no nível de surface e bootstrap, mas não no nível de recall ponta a ponta.

## Interação com Memory Runtime

- Active Memory deve consultar o runtime `memory-mempalace` para recuperar memória relevante.
- o runtime continua sendo a fronteira oficial com o MemPalace.
- Active Memory não deve manter uma verdade paralela fora do backend durável.

## Interação com Context Engine

- Active Memory é preferido para recall automático forte.
- `claw-context-mempalace` é o caminho mínimo alternativo para o modo `recommended`.
- em `full`, o context engine continua responsável por budget, pruning e formato de injeção.

## Fallbacks e Degradação

- se Active Memory não estiver operacional em uma versão-alvo, o modo `recommended` continua sendo o baseline aceitável para recall automático via context engine.
- a degradação deve ser explícita em compatibilidade e smoke tests.
- nenhum documento deve afirmar recall automático forte em `full` sem harness executado.

## Limitações da Versão-Alvo

- em `2026.4.14`, a surface existe e aceita configuração.
- o comportamento de blocking pre-reply recall ainda não foi observado ponta a ponta com os plugins finais.
- por isso, o status correto permanece `partially_validated`.

## v1 obrigatório

- documentação explícita do seam `plugins.entries.active-memory`.
- classificação correta do estado atual como `partially_validated`.
- distinção entre surface validada e recall ainda não provado.

## recomendado

- modo `full` documentado.
- cooperação planejada com runtime e context engine.
- harness futuro para prova observável de recall automático forte.

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
