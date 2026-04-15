# HOOKS.md

## Objetivo

Este documento define o contrato operacional dos hooks usados para captura de eventos, normalização e spool local.

Ele traduz as restrições de [SPEC.md](SPEC.md) e [REASONING.md](REASONING.md) para um formato executável pelas próximas etapas, sem atribuir aos hooks responsabilidades de retrieval ou recall pré-resposta.

## Papel dos Hooks no Sistema

- capturar eventos relevantes do ciclo de vida do host;
- normalizar payloads em envelopes versionados;
- persistir envelopes em spool local append-only;
- enfileirar ingestão para o sync daemon;
- disparar refresh leve de runtime quando apropriado.

Os hooks não devem:

- realizar retrieval pesado;
- bloquear o fluxo principal com classificação cara inline;
- assumir o papel de mecanismo principal de recall automático.

## Eventos Suportados

Eventos mínimos de v1:

- `/new`
- `/reset`
- `stop`
- `pre-compact`
- fim de sessão
- `milestone`
- sync agendado
- pós-ingest

Semântica mínima:

- `/new`
  - inicia um novo contexto de sessão e permite flush seguro da sessão anterior.
- `/reset`
  - reinicia o contexto atual e deve gerar envelope próprio.
- `stop`
  - indica interrupção do fluxo e oportunidade de flush.
- `pre-compact`
  - captura contexto imediatamente antes de qualquer compactação interna do host.
- fim de sessão
  - fecha a captura da sessão e garante persistência no spool.
- `milestone`
  - registra um ponto semanticamente relevante, como decisão ou entrega.
- sync agendado
  - dispara o processamento pendente do spool e de fontes externas.
- pós-ingest
  - registra que a ingestão terminou e que um refresh de runtime pode ser solicitado.

## Payloads e Envelopes

Envelope normalizado alvo:

```json
{
  "version": "v1",
  "event": "milestone",
  "sessionId": "sess_123",
  "agentId": "agent_main",
  "timestamp": "2026-04-15T12:00:00Z",
  "payload": {},
  "idempotencyKey": "evt_123"
}
```

Campos obrigatórios:

- `version`
  - versão do envelope.
- `event`
  - nome canônico do evento.
- `sessionId`
  - identificador lógico da sessão.
- `agentId`
  - identificador lógico do agente que emitiu ou observou o evento.
- `timestamp`
  - instante do evento normalizado.
- `payload`
  - conteúdo específico do evento.
- `idempotencyKey`
  - chave estável para evitar reprocessamento indevido.

## Spool Local

- formato canônico: spool local append-only.
- cada envelope deve ser persistido em formato versionado, com fronteira clara entre envelopes.
- o nome final do diretório de spool não fica congelado nesta etapa porque o spec não exige um path definitivo.
- o spool é um buffer operacional entre hooks e sync daemon.

Regras:

- não apagar envelopes já persistidos sem política explícita.
- não sobrescrever envelopes para representar retries.
- não depender de memória volátil do processo para integridade do fluxo.

## Idempotência e Reprocessamento

- `idempotencyKey` é a primeira barreira contra duplicação.
- o sync daemon deve tratar reexecuções do mesmo envelope como seguras.
- envelopes inválidos devem ser isolados sem quebrar o processamento dos demais.
- o fato de um envelope já existir no spool não significa que já foi ingerido no MemPalace.

## Fluxo Operacional

```text
host event
  -> hook
  -> envelope normalizado
  -> spool local append-only
  -> sync daemon
  -> MemPalace
  -> runtime refresh
```

Ordem mínima esperada:

1. capturar evento.
2. normalizar em envelope estável.
3. persistir no spool.
4. retornar controle ao host sem retrieval pesado.
5. deixar o processamento posterior para o sync daemon.

## Limites e Restrições

- hooks só capturam, enfileiram e disparam refresh.
- hooks não fazem retrieval pesado.
- hooks não fazem classificação cara inline.
- hooks não são mecanismo principal de recall pré-resposta.
- qualquer tentativa de usar hook como pre-reply recall compromete o desenho do runtime replacement e conflita com o spec.

## v1 obrigatório

- envelopes versionados com os campos canônicos.
- eventos mínimos listados neste documento.
- spool local append-only.
- idempotência básica por `idempotencyKey`.

## recomendado

- métricas de volume e atraso do spool.
- classificação leve assíncrona após persistência.
- retries com backoff no daemon, não nos hooks.

## v2

- envelopes especializados por tipo de artefato.
- compressão ou compactação de spool com trilha de auditoria.
- roteamento por prioridade de ingestão.

## não-objetivos

- recall pré-resposta via hook.
- processamento pesado inline no loop de conversa.
- substituir o sync daemon.
- substituir MemPalace como storage.

## Referências

- [SPEC.md](SPEC.md)
- [REASONING.md](REASONING.md)
- [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md)
- [TEST_STRATEGY.md](TEST_STRATEGY.md)
