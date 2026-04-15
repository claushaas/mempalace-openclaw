import fs from 'node:fs';
import path from 'node:path';

import {
	HOST_ROOT_DIR,
	MEMPALACE_INGEST_HOOKS_DIR,
	MEMPALACE_INGEST_HOOK_EVIDENCE_ID,
	MEMPALACE_MCP_SHIM_PATH,
	MEMORY_MEMPALACE_DIR,
	MEMORY_MEMPALACE_ID,
	RESULTS_DIR,
	bootstrapHostEnvironment,
	buildBaseReport,
	ensureLinkedPluginInstalled,
	inspectPlugin,
	readProbeEvidence,
	runCommand,
	runOpenClaw,
	spawnOpenClaw,
	updateHostConfig,
	validateConfig,
	wait,
	withTemporarilyDetachedNodeModules,
	writeJson,
} from './shared.mjs';

function readDirectoryEntries(dirPath) {
	if (!fs.existsSync(dirPath)) {
		return [];
	}
	return fs.readdirSync(dirPath).sort();
}

async function stopGateway(handle) {
	handle.child.kill('SIGTERM');
	await wait(1000);
	if (!handle.child.killed) {
		handle.child.kill('SIGKILL');
	}
}

bootstrapHostEnvironment();
runCommand('pnpm', ['build']);

const shimStatePath = path.join(RESULTS_DIR, 'mempalace-shim-state.json');
const spoolBaseDir = path.join(process.cwd(), '.tmp', 'mempalace-openclaw', 'spool');
const managedHookInstallPath = path.join(
	HOST_ROOT_DIR,
	'state',
	'hooks',
	'mempalace-ingest-hooks',
);

fs.rmSync(spoolBaseDir, { force: true, recursive: true });
fs.rmSync(shimStatePath, { force: true });
await withTemporarilyDetachedNodeModules(MEMORY_MEMPALACE_DIR, async () => {
	ensureLinkedPluginInstalled(MEMORY_MEMPALACE_DIR);
});
fs.rmSync(managedHookInstallPath, { force: true, recursive: true });
runOpenClaw([
	'plugins',
	'install',
	'--dangerously-force-unsafe-install',
	MEMPALACE_INGEST_HOOKS_DIR,
], { timeoutMs: 15000 });

updateHostConfig((config) => {
	config.plugins ??= {};
	config.plugins.entries ??= {};
	config.plugins.entries[MEMORY_MEMPALACE_ID] = {
		enabled: true,
		config: {
			args: [MEMPALACE_MCP_SHIM_PATH],
			command: process.execPath,
			defaultResultLimit: 8,
			defaultTokenBudget: 1200,
			env: {
				MEMPALACE_MCP_SHIM_STATE_PATH: shimStatePath,
			},
			timeoutMs: 5000,
			transport: 'stdio',
		},
	};
	config.plugins.slots ??= {};
	config.plugins.slots.memory = MEMORY_MEMPALACE_ID;
	config.hooks ??= {};
	config.hooks.internal ??= {};
	config.hooks.internal.entries ??= {};
	config.hooks.internal.entries['mempalace-session-spool'] = {
		enabled: true,
	};
	config.hooks.internal.entries['mempalace-startup-drain'] = {
		enabled: true,
	};
	return config;
});

const configValidation = validateConfig();
const plugin = inspectPlugin(MEMORY_MEMPALACE_ID);
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
			'stage4-hook-session',
			'--message',
			'/new',
			'--json',
		], { timeoutMs: 15000 }).stdout,
	);
} catch (error) {
	agentError = error instanceof Error ? error.message : String(error);
}

await wait(3000);
await stopGateway(gateway);

const runtimeQuery = JSON.parse(
	runCommand(
		'pnpm',
		[
			'exec',
			'tsx',
			'./scripts/host-real/query-memory-runtime.mts',
			'stage4-hook-session',
		],
		{
			env: {
				...process.env,
				MEMPALACE_MCP_SHIM_STATE_PATH: shimStatePath,
			},
		},
	).stdout,
);

const spoolState = {
	failed: readDirectoryEntries(path.join(spoolBaseDir, 'failed')),
	pending: readDirectoryEntries(path.join(spoolBaseDir, 'pending')),
	processed: readDirectoryEntries(path.join(spoolBaseDir, 'processed')),
};
const evidence = readProbeEvidence(MEMPALACE_INGEST_HOOK_EVIDENCE_ID);
const memoryEvidence = readProbeEvidence(MEMORY_MEMPALACE_ID);
const gatewayOutput = gateway.getOutput();

const report = buildBaseReport('host-real:mempalace-ingest-hooks', {
	agentError,
	agentResult,
	configValidation,
	evidence,
	gatewayOutput,
	hooksCheck,
	hooksList,
	memoryEvidence,
	packageDir: MEMPALACE_INGEST_HOOKS_DIR,
	plugin,
	runtimeQuery,
	shimStatePath,
	spoolBaseDir,
	spoolState,
	statusClassification:
		configValidation.valid &&
		plugin.plugin?.memorySlotSelected === true &&
		evidence.some((entry) => entry.event === 'hook.session-spool.persisted') &&
		evidence.some((entry) => entry.event === 'processor.record-processed') &&
		spoolState.pending.length === 0 &&
		spoolState.processed.length > 0 &&
		runtimeQuery.results.some((entry) => entry.artifactId.includes('stage4-hook-session'))
			? 'validated'
			: 'blocked',
	statusNotes: [
		'This harness validates the real hook pack, local spool, embedded processor and post-ingest refresh path for Etapa 4.',
		'The hook pack remains separate from the memory runtime and does not prove automatic pre-reply recall.',
		'The MemPalace backend seam is exercised through the shared MCP stdio shim with persisted state.',
	],
});

const outputPath = path.join(RESULTS_DIR, 'host-real-mempalace-ingest-hooks.json');
writeJson(outputPath, report);
console.log(JSON.stringify(report, null, 2));
