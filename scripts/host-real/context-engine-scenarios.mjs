import fs from 'node:fs';
import path from 'node:path';

import {
	CONTEXT_ENGINE_MEMPALACE_DIR,
	CONTEXT_ENGINE_MEMPALACE_ID,
	HOST_STATE_DIR,
	MEMPALACE_MCP_SHIM_STATE_PATH,
	MEMORY_MEMPALACE_DIR,
	MEMORY_MEMPALACE_ID,
	RESULTS_DIR,
	bootstrapHostEnvironment,
	buildBaseReport,
	buildMemoryPluginConfig,
	buildMockProviderConfig,
	ensureLinkedPluginInstalled,
	extractAgentReplyText,
	hostEnv,
	inspectPlugin,
	readJson,
	readJsonLines,
	readProbeEvidence,
	runCommand,
	runGatewayProbe,
	runOpenClaw,
	startMockOpenAIProvider,
	stopChildProcess,
	updateHostConfig,
	validateConfig,
	waitForFile,
	withTemporarilyDetachedNodeModules,
	writeJson,
	MOCK_OPENAI_REQUEST_LOG_PATH,
} from './shared.mjs';

const EXPECTED_NEEDLE = 'lemon pepper wings';
const MEMORY_QUERY = 'QA movie night snack lemon pepper wings blue cheese';
const PROMPT =
	'Silent snack recall check: what snack do I usually want for QA movie night? Reply in one short sentence.';
const TARGET_NUMBER = '+15555550123';
const ACTIVE_MEMORY_TRANSCRIPT_DIR = 'mempalace-stage5';

function parseJsonOutput(rawOutput) {
	const trimmed = rawOutput.trim();
	if (!trimmed) {
		return {};
	}
	try {
		return JSON.parse(trimmed);
	} catch {
		const start = trimmed.indexOf('{');
		const end = trimmed.lastIndexOf('}');
		if (start >= 0 && end > start) {
			return JSON.parse(trimmed.slice(start, end + 1));
		}
		return { raw: trimmed };
	}
}

function applyModeConfig(config, mode, providerBaseUrl) {
	const providerConfig = buildMockProviderConfig(providerBaseUrl);
	config.agents = providerConfig.agents;
	config.models = providerConfig.models;
	config.plugins ??= {};
	config.plugins.entries ??= {};
	config.plugins.slots ??= {};
	config.plugins.entries[MEMORY_MEMPALACE_ID] = {
		config: buildMemoryPluginConfig(),
		enabled: true,
	};
	config.plugins.slots.memory = MEMORY_MEMPALACE_ID;

	if (mode === 'advanced') {
		config.plugins.entries[MEMORY_MEMPALACE_ID].config = {
			...buildMemoryPluginConfig(),
			advanced: {
				agentDiaries: true,
				knowledgeGraph: true,
				lowConfidenceScoreThreshold: 0.85,
				maxExpandedTerms: 5,
				pinnedMemory: true,
				queryExpansion: true,
			},
		};
	}

	if (mode !== 'memory-only') {
		config.plugins.entries[CONTEXT_ENGINE_MEMPALACE_ID] = {
			config: {
				...(mode === 'advanced'
					? {
							compaction: {
								enabled: true,
								maxCompactedEntries: 4,
								overflowSummaryMaxChars: 160,
							},
						}
					: {}),
				includeMemoryPromptAddition: true,
				maxArtifactLines: 40,
				maxContextTokens: mode === 'advanced' ? 320 : 1200,
				maxEntries: mode === 'advanced' ? 8 : 6,
				minScore: 0.15,
			},
			enabled: true,
		};
		config.plugins.slots.contextEngine = CONTEXT_ENGINE_MEMPALACE_ID;
	}

	if (mode === 'full') {
		config.plugins.entries['active-memory'] = {
			config: {
				allowedChatTypes: ['direct'],
				enabled: true,
				logging: true,
				maxSummaryChars: 220,
				model: 'mock-openai/recall-model',
				persistTranscripts: true,
				promptStyle: 'recall-heavy',
				queryMode: 'recent',
				timeoutMs: 15000,
				transcriptDir: ACTIVE_MEMORY_TRANSCRIPT_DIR,
			},
			enabled: true,
		};
	}

	return config;
}

async function installStage5Plugins(mode) {
	await withTemporarilyDetachedNodeModules(MEMORY_MEMPALACE_DIR, async () => {
		ensureLinkedPluginInstalled(MEMORY_MEMPALACE_DIR);
	});

	if (mode !== 'memory-only') {
		await withTemporarilyDetachedNodeModules(
			CONTEXT_ENGINE_MEMPALACE_DIR,
			async () => {
				ensureLinkedPluginInstalled(CONTEXT_ENGINE_MEMPALACE_DIR);
			},
		);
	}
}

function seedMemory() {
	return runCommand(
		'pnpm',
		['exec', 'tsx', './scripts/host-real/seed-mempalace.mts'],
		{
			env: hostEnv({
				MEMPALACE_MCP_SHIM_STATE_PATH,
				MEMPALACE_SEED_ARTIFACT_ID: 'artifact-needle',
				MEMPALACE_SEED_CLASSIFICATION: 'decision',
				MEMPALACE_SEED_CONTENT:
					'Stable QA movie night snack preference: lemon pepper wings with blue cheese.',
				MEMPALACE_SEED_MEMORY_TYPE: 'facts',
				MEMPALACE_SEED_SOURCE: 'qa-memory',
				MEMPALACE_SEED_SOURCE_PATH: '/memory/qa-snack.md',
			}),
		},
	);
}

function seedMemoryArtifact(overrides = {}) {
	return runCommand(
		'pnpm',
		['exec', 'tsx', './scripts/host-real/seed-mempalace.mts'],
		{
			env: hostEnv({
				MEMPALACE_MCP_SHIM_STATE_PATH,
				...overrides,
			}),
		},
	);
}

function runAgentPrompt() {
	return runOpenClaw([
		'agent',
		'--local',
		'--json',
		'--message',
		PROMPT,
		'--thinking',
		'off',
		'--timeout',
		'45',
		'--to',
		TARGET_NUMBER,
	]);
}

async function findActiveMemoryTranscript() {
	const transcriptRoot = path.join(
		HOST_STATE_DIR,
		'plugins',
		'active-memory',
		'transcripts',
	);
	const stack = [transcriptRoot];
	const matches = [];

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}
		if (!path.basename(current).includes(ACTIVE_MEMORY_TRANSCRIPT_DIR) && !current.includes('active-memory')) {
			continue;
		}
		try {
			for (const entry of await fs.promises.readdir(current, {
				withFileTypes: true,
			}).catch(() => [])) {
				const nextPath = path.join(current, entry.name);
				if (entry.isDirectory()) {
					stack.push(nextPath);
				} else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
					matches.push(nextPath);
				}
			}
		} catch {
			// ignore missing directories
		}
	}

	return matches.sort();
}

function classifyRecommendedRecall(report) {
	return report.replyContainsNeedle &&
		report.contextEvidence.some((entry) => entry.event === 'engine.assemble.complete') &&
		report.contextEvidence.some(
			(entry) =>
				entry.event === 'engine.assemble.complete' &&
				entry.payload?.contextBlockGenerated === true,
		) &&
		report.memoryEvidence.some((entry) => entry.event === 'manager.search') &&
		report.memoryEvidence.some((entry) => entry.event === 'manager.readFile')
		? 'validated'
		: 'blocked';
}

function classifyFullRecall(report) {
	const transcriptText = report.activeMemory.transcripts
		.map((transcript) => transcript.text)
		.join('\n\n');
	const usedActiveMemoryTools =
		transcriptText.includes('memory_search') &&
		transcriptText.includes('memory_get');
	const replyUsesNeedle = report.replyContainsNeedle;
	if (usedActiveMemoryTools && replyUsesNeedle) {
		return 'validated';
	}
	if (report.configValidation.valid && report.gatewayProbe.timedOut) {
		return 'partially_validated';
	}
	return 'blocked';
}

export async function runModeScenario(params) {
	const { mode, name, requireRecall = false } = params;
	bootstrapHostEnvironment();
	runCommand('pnpm', ['build']);
	await installStage5Plugins(mode);

	const mockProvider = await startMockOpenAIProvider({
		expectedNeedle: EXPECTED_NEEDLE,
		memoryQuery: MEMORY_QUERY,
		successReply: 'You usually want lemon pepper wings with blue cheese.',
	});

	try {
		updateHostConfig((config) =>
			applyModeConfig(config, mode, mockProvider.info.baseUrl),
		);
		const configValidation = validateConfig();
		const memoryPlugin = inspectPlugin(MEMORY_MEMPALACE_ID);
		const contextPlugin =
			mode === 'memory-only'
				? null
				: inspectPlugin(CONTEXT_ENGINE_MEMPALACE_ID);
		const activeMemoryPlugin =
			mode === 'full' ? inspectPlugin('active-memory') : null;
		const gatewayProbe = runGatewayProbe();

		seedMemory();
		if (mode === 'advanced') {
			seedMemoryArtifact({
				MEMPALACE_SEED_ARTIFACT_ID: 'artifact-advanced-pinned',
				MEMPALACE_SEED_CLASSIFICATION: 'decision',
				MEMPALACE_SEED_CONTENT:
					'Cinema preference note: lemon pepper wings with blue cheese are the QA movie night default.',
				MEMPALACE_SEED_MEMORY_TYPE: 'facts',
				MEMPALACE_SEED_METADATA_JSON: JSON.stringify({
					pinned: true,
					pinScope: 'global',
				}),
				MEMPALACE_SEED_SOURCE: 'advanced-memory',
				MEMPALACE_SEED_SOURCE_PATH: '/memory/cinema-preference.md',
			});
			for (const [index, classification] of [
				'conversation',
				'artifact',
				'conversation',
				'artifact',
			].entries()) {
				seedMemoryArtifact({
					MEMPALACE_SEED_ARTIFACT_ID: `artifact-advanced-overflow-${index + 1}`,
					MEMPALACE_SEED_CLASSIFICATION: classification,
					MEMPALACE_SEED_CONTENT: `Overflow context ${index + 1}: additional QA memory block for compaction coverage.`,
					MEMPALACE_SEED_MEMORY_TYPE:
						classification === 'conversation' ? 'events' : 'discoveries',
					MEMPALACE_SEED_SOURCE: `overflow-${index + 1}`,
					MEMPALACE_SEED_SOURCE_PATH: `/memory/overflow-${index + 1}.md`,
				});
			}
		}
		const firstPrompt =
			mode === 'advanced'
				? 'Diary bootstrap note: remember that I mentioned the QA cinema preference. Reply briefly.'
				: PROMPT;
		const secondPrompt =
			mode === 'advanced'
				? 'For tonight\'s cinema outing, what should I probably order there again for the usual QA thing?'
				: undefined;
		const thirdPrompt =
			mode === 'advanced'
				? 'Silent diary recall check: what food preference did I mention earlier today?'
				: undefined;
		const firstAgentRun = runOpenClaw([
			'agent',
			'--local',
			'--json',
			'--message',
			firstPrompt,
			'--thinking',
			'off',
			'--timeout',
			'45',
			'--to',
			TARGET_NUMBER,
		]);
		const secondAgentRun = secondPrompt
			? runOpenClaw([
					'agent',
					'--local',
					'--json',
					'--message',
					secondPrompt,
					'--thinking',
					'off',
					'--timeout',
					'45',
					'--to',
					TARGET_NUMBER,
				])
			: firstAgentRun;
		const agentRun = thirdPrompt
			? runOpenClaw([
					'agent',
					'--local',
					'--json',
					'--message',
					thirdPrompt,
					'--thinking',
					'off',
					'--timeout',
					'45',
					'--to',
					TARGET_NUMBER,
				])
			: secondAgentRun;
		const agentOutput = parseJsonOutput(agentRun.stdout || agentRun.stderr);
		const providerRequests = readJsonLines(MOCK_OPENAI_REQUEST_LOG_PATH);
		const replyText =
			extractAgentReplyText(agentOutput) ||
			(providerRequests
				.toReversed()
				.find((request) => typeof request.responseContent === 'string')
				?.responseContent ??
				'');
		const memoryEvidence = readProbeEvidence(MEMORY_MEMPALACE_ID);
		const contextEvidence =
			mode === 'memory-only'
				? []
				: readProbeEvidence(CONTEXT_ENGINE_MEMPALACE_ID);

		const activeMemoryTranscriptPaths =
			mode === 'full' ? await findActiveMemoryTranscript() : [];
		const activeMemoryTranscripts = activeMemoryTranscriptPaths.map((filePath) => ({
			path: filePath,
			text: fs.readFileSync(filePath, 'utf8'),
		}));

		const report = buildBaseReport(name, {
			activeMemory: {
				plugin: activeMemoryPlugin,
				transcripts: activeMemoryTranscripts,
			},
			agentOutput,
			agentRun: {
				firstStderr: firstAgentRun.stderr,
				firstStdout: firstAgentRun.stdout,
				secondStderr: secondAgentRun.stderr,
				secondStdout: secondAgentRun.stdout,
				stderr: agentRun.stderr,
				stdout: agentRun.stdout,
			},
			configValidation,
			contextEvidence,
			contextPlugin,
			expectedNeedle: EXPECTED_NEEDLE,
			gatewayProbe,
			memoryEvidence,
			memoryPlugin,
			mode,
			providerInfo: mockProvider.info,
			providerRequests,
			replyContainsNeedle: replyText
				.toLowerCase()
				.includes(EXPECTED_NEEDLE.toLowerCase()),
			replyText,
			requireRecall,
		});

		if (mode === 'memory-only') {
			report.statusClassification =
				report.configValidation.valid &&
				report.memoryPlugin.plugin?.memorySlotSelected === true
					? 'validated'
					: 'blocked';
			report.statusNotes = [
				'Smoke test do modo memory-only: o runtime de memória carrega, mas este modo não é o caminho canônico para recall automático forte.',
				report.replyContainsNeedle
					? 'Nesta execução houve resposta correta, mas isso não é tratado como prova estável de recall pré-resposta para memory-only.'
					: 'A ausência do needle continua compatível com a limitação documentada do modo memory-only.',
			];
		} else if (mode === 'recommended') {
			report.statusClassification = requireRecall
				? classifyRecommendedRecall(report)
				: report.configValidation.valid &&
					  report.contextPlugin?.plugin?.contextEngineIds?.includes(
							CONTEXT_ENGINE_MEMPALACE_ID,
					  )
					? 'validated'
					: 'blocked';
			report.statusNotes = requireRecall
				? [
						'Este harness é o critério canônico de aceite da Etapa 5.',
						'Ele exige assemble real do context engine, search/read do runtime de memória e resposta final contendo o needle sem skill explícita.',
					]
				: [
						'Smoke test do modo recommended: boot do runtime de memória e do context engine com provider mock local.',
					];
		} else if (mode === 'advanced') {
			const expansionObserved = report.memoryEvidence.some(
				(entry) =>
					entry.event === 'manager.search' &&
					entry.payload?.expansionApplied === true,
			);
			const pinnedPriorityObserved = report.contextEvidence.some(
				(entry) =>
					entry.event === 'engine.assemble.complete' &&
					Array.isArray(entry.payload?.selectedArtifactIds) &&
					entry.payload.selectedArtifactIds[0] === 'artifact-advanced-pinned',
			);
			const diaryObserved = report.contextEvidence.some(
				(entry) =>
					entry.event === 'engine.assemble.diary.injected' &&
					typeof entry.payload?.injectedDiaryCount === 'number' &&
					entry.payload.injectedDiaryCount > 0,
			);
			const compactionObserved = report.contextEvidence.some(
				(entry) =>
					entry.event === 'engine.assemble.compaction' &&
					typeof entry.payload?.compactedCount === 'number' &&
					entry.payload.compactedCount > 0,
			);
			report.statusClassification =
				report.replyContainsNeedle &&
				expansionObserved &&
				pinnedPriorityObserved &&
				diaryObserved &&
				compactionObserved
					? 'validated'
					: 'blocked';
			report.statusNotes = [
				'Este harness valida as extensões opcionais da Etapa 8 com shim local: query expansion, pinned memory, diary e compaction transitória.',
				'Ele não altera o contrato v1; apenas verifica que o runtime permanece funcional com as flags avançadas habilitadas.',
			];
		} else {
			report.statusClassification = requireRecall
				? classifyFullRecall(report)
				: report.configValidation.valid &&
					  report.contextPlugin?.plugin?.contextEngineIds?.includes(
							CONTEXT_ENGINE_MEMPALACE_ID,
					  )
					? 'validated'
					: 'blocked';
			report.statusNotes = requireRecall
				? [
						'Best-effort do modo full: o status só sobe para validated se o pass pré-resposta de Active Memory ficar observável.',
						'Sem transcript com memory_search + memory_get antes da resposta principal, o resultado correto é partially_validated.',
					]
				: [
						'Smoke test do modo full: bootstrap do conjunto memory + context engine + active-memory.',
					];
		}

		return report;
	} finally {
		await stopChildProcess(mockProvider.child);
	}
}
