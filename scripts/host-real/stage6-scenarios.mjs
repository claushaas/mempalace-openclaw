import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

import {
	CONTEXT_ENGINE_MEMPALACE_DIR,
	CONTEXT_ENGINE_MEMPALACE_ID,
	HOST_ROOT_DIR,
	HOST_STATE_DIR,
	HOST_WORKSPACE_DIR,
	MEMPALACE_INGEST_HOOKS_DIR,
	MEMPALACE_INGEST_HOOK_EVIDENCE_ID,
	MEMPALACE_MCP_SHIM_STATE_PATH,
	MEMORY_MEMPALACE_DIR,
	MEMORY_MEMPALACE_ID,
	RESULTS_DIR,
	SKILL_MEMPALACE_SYNC_DIR,
	SKILL_MEMPALACE_SYNC_ID,
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
	spawnOpenClaw,
	startMockOpenAIProvider,
	stopChildProcess,
	updateHostConfig,
	validateConfig,
	wait,
	withTemporarilyDetachedNodeModules,
} from './shared.mjs';

const syncDaemonRequire = createRequire(
	path.join(HOST_ROOT_DIR, '..', '..', 'packages', 'sync-daemon', 'package.json'),
);
const Database = syncDaemonRequire('better-sqlite3');

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

function resolveStage6StateDir() {
	return path.join(HOST_STATE_DIR, 'plugins', 'mempalace-openclaw', 'sync');
}

function resolveStage6DbPath() {
	return path.join(resolveStage6StateDir(), 'sync.db');
}

function resolveStage6SpoolPath() {
	return path.join(resolveStage6StateDir(), 'spool');
}

function openDatabase(dbPath = resolveStage6DbPath()) {
	return new Database(dbPath, { readonly: true });
}

function readDatabaseSnapshot(dbPath = resolveStage6DbPath()) {
	const db = openDatabase(dbPath);
	try {
		return {
			errors: db.prepare('SELECT job_id, error_message FROM errors ORDER BY rowid ASC').all(),
			files: db.prepare('SELECT * FROM files ORDER BY path ASC').all(),
			jobs: db.prepare('SELECT * FROM jobs ORDER BY started_at ASC').all(),
			runtimeRefresh: db
				.prepare('SELECT * FROM runtime_refresh ORDER BY triggered_at ASC')
				.all(),
			sources: db.prepare('SELECT * FROM sources ORDER BY id ASC').all(),
		};
	} finally {
		db.close();
	}
}

function readSpoolState(spoolBaseDir = resolveStage6SpoolPath()) {
	const readEntries = (dirPath) =>
		fs.existsSync(dirPath)
			? fs.readdirSync(dirPath).filter((entry) => entry.endsWith('.json')).sort()
			: [];
	return {
		baseDir: spoolBaseDir,
		failed: readEntries(path.join(spoolBaseDir, 'failed')),
		pending: readEntries(path.join(spoolBaseDir, 'pending')),
		processed: readEntries(path.join(spoolBaseDir, 'processed')),
	};
}

async function ensureInstalledPackages(options = {}) {
	await withTemporarilyDetachedNodeModules(MEMORY_MEMPALACE_DIR, () => {
		ensureLinkedPluginInstalled(MEMORY_MEMPALACE_DIR);
	});
	await withTemporarilyDetachedNodeModules(SKILL_MEMPALACE_SYNC_DIR, () => {
		ensureLinkedPluginInstalled(SKILL_MEMPALACE_SYNC_DIR);
	});
	if (options.installContextEngine) {
		await withTemporarilyDetachedNodeModules(CONTEXT_ENGINE_MEMPALACE_DIR, () => {
			ensureLinkedPluginInstalled(CONTEXT_ENGINE_MEMPALACE_DIR);
		});
	}
	if (options.installHooks) {
		runOpenClaw([
			'plugins',
			'install',
			'--dangerously-force-unsafe-install',
			MEMPALACE_INGEST_HOOKS_DIR,
		]);
	}
}

function configureStage6Host(options = {}) {
	updateHostConfig((config) => {
		config.plugins ??= {};
		config.plugins.entries ??= {};
		config.plugins.slots ??= {};
		config.plugins.entries[MEMORY_MEMPALACE_ID] = {
			config: buildMemoryPluginConfig(),
			enabled: true,
		};
		config.plugins.entries[SKILL_MEMPALACE_SYNC_ID] = {
			config: {},
			enabled: true,
		};
		config.plugins.slots.memory = MEMORY_MEMPALACE_ID;

		if (options.providerBaseUrl) {
			const providerConfig = buildMockProviderConfig(options.providerBaseUrl);
			config.agents = providerConfig.agents;
			config.models = providerConfig.models;
		}

		if (options.installContextEngine) {
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

		if (options.installHooks) {
			config.hooks ??= {};
			config.hooks.internal ??= {};
			config.hooks.internal.entries ??= {};
			config.hooks.internal.entries['mempalace-session-spool'] = {
				enabled: true,
			};
			config.hooks.internal.entries['mempalace-startup-drain'] = {
				enabled: true,
			};
		}

		return config;
	});
}

function runSyncCli(args) {
	return runOpenClaw(['mempalace-sync', ...args]);
}

function createFilesystemFixture() {
	const fixtureDir = path.join(HOST_WORKSPACE_DIR, 'stage6-filesystem');
	fs.mkdirSync(fixtureDir, { recursive: true });
	const expectedNeedle = 'saffron ramen';
	fs.writeFileSync(
		path.join(fixtureDir, 'notes.md'),
		`# Stage 6 Filesystem Fixture\n\nDecision: the canonical stage 6 filesystem recall phrase is ${expectedNeedle}.\n`,
	);
	fs.writeFileSync(
		path.join(fixtureDir, 'extra.txt'),
		`Milestone: keep remembering ${expectedNeedle} during host-real validation.\n`,
	);
	const configPath = path.join(HOST_ROOT_DIR, 'stage6-filesystem-source.json');
	fs.writeFileSync(
		configPath,
		`${JSON.stringify(
			{
				id: 'stage6-filesystem',
				include: ['**/*.md', '**/*.txt'],
				kind: 'filesystem',
				mode: 'notes',
				path: fixtureDir,
				schedule: '*/30 * * * *',
			},
			null,
			2,
		)}\n`,
	);
	return {
		configPath,
		expectedNeedle,
		prompt:
			'What is the canonical stage 6 filesystem recall phrase? Reply with only the phrase.',
		sourceId: 'stage6-filesystem',
		workspaceDir: fixtureDir,
	};
}

function createGitFixture() {
	const fixtureDir = path.join(HOST_WORKSPACE_DIR, 'stage6-git');
	fs.mkdirSync(fixtureDir, { recursive: true });
	const expectedNeedle = 'forge lantern';
	fs.writeFileSync(
		path.join(fixtureDir, 'README.md'),
		`# Stage 6 Git Fixture\n\nDecision: the canonical git recall phrase is ${expectedNeedle}.\n`,
	);
	spawnSync('git', ['init'], { cwd: fixtureDir, encoding: 'utf8' });
	spawnSync('git', ['config', 'user.email', 'stage6@example.com'], {
		cwd: fixtureDir,
		encoding: 'utf8',
	});
	spawnSync('git', ['config', 'user.name', 'Stage 6'], {
		cwd: fixtureDir,
		encoding: 'utf8',
	});
	spawnSync('git', ['add', '.'], { cwd: fixtureDir, encoding: 'utf8' });
	spawnSync('git', ['commit', '-m', 'seed'], { cwd: fixtureDir, encoding: 'utf8' });
	const configPath = path.join(HOST_ROOT_DIR, 'stage6-git-source.json');
	fs.writeFileSync(
		configPath,
		`${JSON.stringify(
			{
				exclude: ['.git/**'],
				id: 'stage6-git',
				include: ['**/*.md'],
				kind: 'git',
				mode: 'repo',
				path: fixtureDir,
				schedule: '*/30 * * * *',
			},
			null,
			2,
		)}\n`,
	);
	return {
		configPath,
		expectedNeedle,
		prompt:
			'What is the canonical git recall phrase for stage 6? Reply with only the phrase.',
		sourceId: 'stage6-git',
		workspaceDir: fixtureDir,
	};
}

export async function runSkillPluginScenario() {
	bootstrapHostEnvironment();
	runCommand('pnpm', ['build']);
	await ensureInstalledPackages();
	configureStage6Host();
	const configValidation = validateConfig();
	const skillPlugin = inspectPlugin(SKILL_MEMPALACE_SYNC_ID);
	const memoryPlugin = inspectPlugin(MEMORY_MEMPALACE_ID);
	const cliHelp = runSyncCli(['--help']).stdout;
	const listSources = parseJsonOutput(runSyncCli(['list-sources', '--json']).stdout);

	return buildBaseReport('host-real:skill-mempalace-sync', {
		cliHelp,
		configValidation,
		listSources,
		memoryPlugin,
		skillPlugin,
		statusClassification:
			configValidation.valid &&
			skillPlugin?.plugin?.id === SKILL_MEMPALACE_SYNC_ID &&
			cliHelp.includes('mempalace-sync')
				? 'validated'
				: 'blocked',
		statusNotes: [
			'This harness validates the final skill-mempalace-sync plugin as a real OpenClaw command/CLI surface.',
			'It requires real plugin loading plus root CLI availability for mempalace-sync.',
		],
	});
}

export async function runSourceScenario(kind) {
	bootstrapHostEnvironment();
	const fixture = kind === 'git' ? createGitFixture() : createFilesystemFixture();
	runCommand('pnpm', ['build']);
	await ensureInstalledPackages({ installContextEngine: true });
	const provider = await startMockOpenAIProvider({
		expectedNeedle: fixture.expectedNeedle,
		memoryQuery: fixture.expectedNeedle,
		successReply: fixture.expectedNeedle,
	});

	try {
		configureStage6Host({
			installContextEngine: true,
			providerBaseUrl: provider.info.baseUrl,
		});
		const configValidation = validateConfig();
		const skillPlugin = inspectPlugin(SKILL_MEMPALACE_SYNC_ID);
		const memoryPlugin = inspectPlugin(MEMORY_MEMPALACE_ID);
		const contextPlugin = inspectPlugin(CONTEXT_ENGINE_MEMPALACE_ID);
		const addSource = parseJsonOutput(
			runSyncCli(['add-source', '--config', fixture.configPath]).stdout,
		);
		const runResult = parseJsonOutput(runSyncCli(['run', '--json']).stdout);
		const status = parseJsonOutput(
			runSyncCli(['status', '--source-id', fixture.sourceId, '--json']).stdout,
		);
		const gatewayProbe = runGatewayProbe();
		const agentRun = runOpenClaw([
			'agent',
			'--local',
			'--session-id',
			`${fixture.sourceId}-recall`,
			'--json',
			'--message',
			fixture.prompt,
			'--thinking',
			'off',
			'--timeout',
			'45',
		]);
		const agentOutput = parseJsonOutput(agentRun.stdout || agentRun.stderr);
		const replyText = extractAgentReplyText(agentOutput);
		const providerRequests = readJsonLines(
			path.join(RESULTS_DIR, 'mock-openai-requests.jsonl'),
		);
		const dbSnapshot = readDatabaseSnapshot();
		const memoryEvidence = readProbeEvidence(MEMORY_MEMPALACE_ID);
		const contextEvidence = readProbeEvidence(CONTEXT_ENGINE_MEMPALACE_ID);
		const syncEvidence = readProbeEvidence('sync-daemon');

		return buildBaseReport(`host-real:sync-${kind}`, {
			addSource,
			agentOutput,
			configValidation,
			contextEvidence,
			contextPlugin,
			dbSnapshot,
			fixture,
			gatewayProbe,
			memoryEvidence,
			memoryPlugin,
			providerRequests,
			replyContainsNeedle: replyText.toLowerCase().includes(fixture.expectedNeedle.toLowerCase()),
			replyText,
			runResult,
			skillPlugin,
			status,
			syncEvidence,
			statusClassification:
				configValidation.valid &&
				dbSnapshot.sources.some((entry) => entry.id === fixture.sourceId) &&
				dbSnapshot.runtimeRefresh.length > 0 &&
				contextEvidence.some(
					(entry) =>
						entry.event === 'engine.assemble.complete' &&
						entry.payload?.contextBlockGenerated === true,
				) &&
				memoryEvidence.some((entry) => entry.event === 'manager.search') &&
				memoryEvidence.some((entry) => entry.event === 'manager.readFile') &&
				replyText.toLowerCase().includes(fixture.expectedNeedle.toLowerCase())
					? 'validated'
					: 'blocked',
			statusNotes: [
				'This harness validates stage 6 source ingestion through sync-daemon plus recall consultability through memory-mempalace and claw-context-mempalace.',
				'The daemon owns sync.db, source execution, runtime refresh and the durable write path to MemPalace.',
			],
		});
	} finally {
		await stopChildProcess(provider.child);
	}
}

async function stopGateway(handle) {
	handle.child.kill('SIGTERM');
	await wait(1000);
	if (!handle.child.killed) {
		handle.child.kill('SIGKILL');
	}
}

export async function runSpoolCutoverScenario() {
	bootstrapHostEnvironment();
	runCommand('pnpm', ['build']);
	await ensureInstalledPackages({ installHooks: true });
	configureStage6Host({ installHooks: true });
	const configValidation = validateConfig();
	const hooksList = JSON.parse(runOpenClaw(['hooks', 'list', '--json']).stdout);
	const hooksCheck = JSON.parse(runOpenClaw(['hooks', 'check', '--json']).stdout);

	const gateway = spawnOpenClaw(['gateway', 'run', '--verbose']);
	await wait(4000);

	let agentResult = null;
	let agentError = null;
	try {
		agentResult = JSON.parse(
			runOpenClaw([
				'agent',
				'--session-id',
				'stage6-spool-session',
				'--message',
				'/new',
				'--json',
			]).stdout,
		);
	} catch (error) {
		agentError = error instanceof Error ? error.message : String(error);
	}

	await wait(2000);
	const spoolBeforeRun = readSpoolState();
	const runResult = parseJsonOutput(runSyncCli(['run', '--json']).stdout);
	await wait(1000);
	await stopGateway(gateway);

	const spoolAfterRun = readSpoolState();
	const dbSnapshot = readDatabaseSnapshot();
	const shimState = readJson(MEMPALACE_MCP_SHIM_STATE_PATH);
	const hookEvidence = readProbeEvidence(MEMPALACE_INGEST_HOOK_EVIDENCE_ID);
	const syncEvidence = readProbeEvidence('sync-daemon');

	return buildBaseReport('host-real:sync-spool-cutover', {
		agentError,
		agentResult,
		configValidation,
		dbSnapshot,
		hookEvidence,
		hooksCheck,
		hooksList,
		runResult,
		shimState,
		spoolAfterRun,
		spoolBeforeRun,
		syncEvidence,
		statusClassification:
			configValidation.valid &&
			spoolBeforeRun.pending.length > 0 &&
			spoolAfterRun.pending.length === 0 &&
			spoolAfterRun.processed.length > 0 &&
			dbSnapshot.files.some((entry) => String(entry.path).startsWith('spool:')) &&
			Object.values(shimState.artifacts ?? {}).some(
				(artifact) => artifact.source === 'openclaw-hook-pack',
			)
				? 'validated'
				: 'blocked',
		statusNotes: [
			'This harness validates the Etapa 6 spool cutover: hooks enqueue only, sync-daemon drains pending records and triggers refresh.',
			'The hook pack no longer owns the processor path in this stage.',
		],
	});
}
