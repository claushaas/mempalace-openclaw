# HOOKS.md

## Objetivo

Este documento define o contrato operacional dos hooks usados para captura de eventos, normalização e spool local.

Ele traduz as restrições de [SPEC.md](SPEC.md) e [REASONING.md](REASONING.md) para um formato executável pelas próximas etapas, sem atribuir aos hooks responsabilidades de retrieval ou recall pré-resposta.

## Papel dos Hooks no Sistema

- capturar eventos relevantes do ciclo de vida do host;
- normalizar payloads em envelopes versionados;
- persistir envelopes em spool local append-only;
- enfileirar ingestão para o processador embutido da Etapa 4;
- disparar refresh leve de runtime quando apropriado.

Os hooks não devem:

- realizar retrieval pesado;
- bloquear o fluxo principal com classificação cara inline;
- assumir o papel de mecanismo principal de recall automático.

## Eventos Suportados

Eventos host-reais suportados na Etapa 4:

- `command:new`
- `command:reset`
- `command:stop`
- `session:compact:before`
- `gateway:startup`

Eventos internos do pipeline local:

- `end-of-session`
- `milestone`
- `scheduled-sync`
- `post-ingest-refresh`

Semântica mínima:

- `command:new`
  - inicia um novo contexto de sessão e permite flush seguro da sessão anterior.
- `command:reset`
  - reinicia o contexto atual e deve gerar envelope próprio.
- `command:stop`
  - indica interrupção do fluxo e oportunidade de flush.
- `session:compact:before`
  - captura contexto imediatamente antes de qualquer compactação interna do host.
- `gateway:startup`
  - dispara o dreno de itens pendentes do spool local.
- `end-of-session`
  - fecha a captura da sessão em nível de pipeline local quando não houver evento host-real mais específico.
- `milestone`
  - registra um ponto semanticamente relevante, como decisão ou entrega, pelo pipeline interno.
- `scheduled-sync`
  - dispara o processamento pendente do spool e de fontes externas.
- `post-ingest-refresh`
  - registra que a ingestão terminou e que um refresh de runtime foi solicitado.

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
- na Etapa 4, o spool fica congelado em `.tmp/mempalace-openclaw/spool/`.
- subdiretórios mínimos:
  - `pending/`
  - `processed/`
  - `failed/`
- o spool é um buffer operacional entre hooks e o processador embutido; o `sync-daemon` passa a substituir essa função em etapas posteriores.

Regras:

- não apagar envelopes já persistidos sem política explícita.
- não sobrescrever envelopes para representar retries.
- não depender de memória volátil do processo para integridade do fluxo.
- toda escrita de spool deve ser atômica.
- o envelope público não recebe `source` nem `fingerprint`; esses campos ficam no `SpoolRecord` interno.

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
  -> processador embutido
  -> MemPalace
  -> runtime refresh
```

Ordem mínima esperada:

1. capturar evento.
2. normalizar em envelope estável.
3. persistir no spool.
4. retornar controle ao host sem retrieval pesado.
5. deixar o processamento posterior para o processador embutido.

## Limites e Restrições

- hooks só capturam, enfileiram e disparam refresh.
- hooks não fazem retrieval pesado.
- hooks não fazem classificação cara inline.
- hooks não são mecanismo principal de recall pré-resposta.
- o hook pack é um artefato operacional separado do runtime `memory-mempalace`.
- qualquer tentativa de usar hook como pre-reply recall compromete o desenho do runtime replacement e conflita com o spec.

## v1 obrigatório

- envelopes versionados com os campos canônicos.
- eventos mínimos listados neste documento.
- spool local append-only.
- idempotência básica por `idempotencyKey`.
- `SpoolRecord` interno com `sourceFingerprint` e `processingState`.
- distinção explícita entre eventos host-reais e eventos internos do pipeline.

## recomendado

- métricas de volume e atraso do spool.
- classificação leve assíncrona após persistência.
- retries com backoff no processador, não nos hooks.

## v2

- envelopes especializados por tipo de artefato.
- compressão ou compactação de spool com trilha de auditoria.
- roteamento por prioridade de ingestão.

## não-objetivos

- recall pré-resposta via hook.
- processamento pesado inline no loop de conversa.
- substituir o sync daemon em definitivo.
- substituir MemPalace como storage.

## Referências

- [SPEC.md](SPEC.md)
- [REASONING.md](REASONING.md)
- [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md)
- [TEST_STRATEGY.md](TEST_STRATEGY.md)
