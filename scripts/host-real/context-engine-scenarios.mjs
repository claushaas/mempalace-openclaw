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

	if (mode !== 'memory-only') {
		config.plugins.entries[CONTEXT_ENGINE_MEMPALACE_ID] = {
			config: {
				includeMemoryPromptAddition: true,
				maxArtifactLines: 40,
				maxContextTokens: 1200,
				maxEntries: 6,
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
		const agentRun = runAgentPrompt();
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
