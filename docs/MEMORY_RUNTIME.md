# MEMORY_RUNTIME.md

## Objetivo

Este documento congela o contrato operacional do slot `memory` que será implementado por `memory-mempalace`.

Ele deriva sua semântica de [SPEC.md](SPEC.md), respeita as restrições de [REASONING.md](REASONING.md) e incorpora as limitações host-real já registradas em [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md).

## Posição no Host OpenClaw

- slot obrigatório: `plugins.slots.memory = "memory-mempalace"`.
- papel: substituir o runtime de memória do host por um adapter para MemPalace.
- responsabilidade:
  - receber consultas do host;
  - recuperar artefatos e memórias do MemPalace;
  - preservar provenance;
  - expor superfícies públicas coerentes com OpenClaw.

Este slot não é:

- um mecanismo de ingestão pesada;
- um context engine;
- uma skill opcional usada sob demanda.

## Contratos Públicos

### `memory_search`

- intenção
  - recuperar memória relevante para uma query do host.
- input lógico
  - consulta textual ou estruturada, com hints opcionais de budget, classificação e fonte.
- output lógico
  - coleção ordenada de resultados com `artifactId`, conteúdo útil, score, classificação e provenance.
- invariantes
  - sempre preservar provenance;
  - misturar memória factual, conversacional e artefatos externos quando houver sinal;
  - nunca retornar resultados sem indicar origem.
- comportamento esperado em erro
  - falhar com erro canônico auditável sem mascarar indisponibilidade do MemPalace;
  - não retornar sucesso vazio quando houve falha upstream.

### `memory_get`

- intenção
  - recuperar um artefato ou memória específica por identificador.
- input lógico
  - identificador lógico do item, com hints opcionais de versão ou source.
- output lógico
  - artefato completo com metadados e provenance.
- invariantes
  - o identificador deve resolver no storage durável ou falhar explicitamente;
  - provenance permanece intacta.
- comportamento esperado em erro
  - item inexistente retorna erro explícito de não encontrado;
  - falha de backend retorna erro operacional distinto.

### `memory_status`

- intenção
  - expor health e readiness do runtime de memória.
- input lógico
  - nenhum obrigatório; pode aceitar escopo ou verbosity.
- output lógico
  - estado do runtime, conectividade com MemPalace, versão lógica do adapter e sinais de refresh pendente.
- invariantes
  - deve refletir o estado real observável do adapter e do backend.
- comportamento esperado em erro
  - indisponibilidade parcial deve aparecer como status degradado, não como sucesso silencioso.

### `memory_index`

- intenção
  - disparar refresh compatível com o runtime, re-sync ou re-mining leve segundo a semântica exposta pelo host.
- input lógico
  - pedido de indexação com escopo, reason ou target opcional.
- output lógico
  - confirmação de trigger, job ou estado de refresh em andamento.
- invariantes
  - `memory_index` não é no-op;
  - precisa produzir efeito operacional verificável, ainda que assíncrono.
- comportamento esperado em erro
  - falha de trigger retorna erro explícito e observável;
  - não responder sucesso se nenhum refresh foi aceito.

### `memory_promote`

- intenção
  - promover memória candidata para status durável de maior prioridade ou confiança.
- input lógico
  - identificador do item e metadados de promoção, como motivo, classificação ou prioridade.
- output lógico
  - confirmação da promoção com metadados atualizados.
- invariantes
  - a operação deve ser auditável e preservar provenance original.
- comportamento esperado em erro
  - tentativa inválida de promoção retorna erro canônico; falha de backend não deve ser mascarada.

## Retrieval Composer

O retrieval composer do `memory-mempalace` deve:

- combinar memória factual;
- combinar memória conversacional;
- combinar artefatos externos ingeridos pelo sync daemon;
- deduplicar resultados semanticamente equivalentes;
- preservar provenance em todos os resultados;
- respeitar budget de contexto desde o primeiro corte, ainda que o pruning principal fique a cargo do context engine.

O retrieval composer não deve:

- depender de resumos como fonte de verdade;
- esconder a origem dos dados retornados;
- converter falha de backend em ausência de memória.

## Proveniência e Metadados

Cada resultado retornado ao host deve carregar, no mínimo:

- `source`
- `sourceType`
- `sourcePath`
- `updatedAt`
- `classification`

Metadados recomendados:

- score do retrieval;
- recency;
- flags de promote ou pin quando existirem;
- indicação de origem factual, conversacional ou artefato externo.

Além das operações `memory_*`, o runtime expõe a capability complementar:

- `publicArtifacts.listArtifacts(...)`

Essa surface publica um catálogo de artefatos JSON espelhados em disco para consumo do context engine e de harnesses host-real.

## Integração com MemPalace

- MemPalace é o backend durável e a source of truth.
- o adapter `memory-mempalace` deve ser a única fronteira entre OpenClaw e MemPalace dentro do runtime de memória.
- operações de search, get, promote e index trigger devem ser traduzidas para as capacidades reais do backend.
- qualquer cache local deve ser derivado, invalidável e subordinado ao estado do MemPalace.

## Integração com Active Memory e Context Engine

- `claw-context-mempalace` consome o runtime de memória para montar contexto.
- o runtime materializa um mirror público em `state/plugins/memory-mempalace/public-artifacts/*.json`.
- esse mirror é derivado do MemPalace e não substitui o backend durável.
- Active Memory, quando suportado operacionalmente, deve acionar recall automático forte usando o runtime como fonte de recuperação.
- nem Active Memory nem context engine devem duplicar storage durável fora do MemPalace.

## Limites Conhecidos do Host

Descoberta host-real já validada:

- em `openclaw@2026.4.14`, selecionar um memory slot externo desativa `memory-core`;
- como `memory-core` controla a árvore CLI `openclaw memory`, essa CLI não é o contrato de prova para um plugin externo de memória nessa versão-alvo.

Consequência prática:

- a prova do runtime deve vir de harnesses próprios, smoke tests de modo operacional e, depois, da prova observável de recall automático.
- em ambiente host-real linkado, o catálogo público em memória do SDK pode não refletir o provider do plugin final; por isso o `claw-context-mempalace` usa o seam público primeiro e cai para o mirror público em disco quando necessário.

## v1 obrigatório

- `plugins.slots.memory = "memory-mempalace"`.
- contratos `memory_search`, `memory_get`, `memory_status`, `memory_index`, `memory_promote`.
- capability pública `publicArtifacts.listArtifacts(...)`.
- preservation de provenance.
- MemPalace como source of truth.
- `memory_index` com efeito operacional real.

## recomendado

- integração com `claw-context-mempalace`.
- ranking com recency e classificação leve.
- harness observável de recall automático em `recommended`.

## v2

- pinned memory.
- query expansion.
- ranking avançado e sinais estruturais adicionais.

## não-objetivos

- usar summaries como storage primário.
- mover a lógica principal de recall para hooks.
- tratar a CLI `openclaw memory` como prova suficiente de compatibilidade do plugin externo.
- fundir runtime de memória com context injection.

## Referências

- [SPEC.md](SPEC.md)
- [REASONING.md](REASONING.md)
- [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md)
- [TEST_STRATEGY.md](TEST_STRATEGY.md)
