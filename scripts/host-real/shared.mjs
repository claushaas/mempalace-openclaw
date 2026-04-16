import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '../..');
export const OPENCLAW_VERSION = '2026.4.14';
export const HOST_ROOT_DIR = path.join(ROOT_DIR, '.tmp', 'openclaw-host');
export const RESULTS_DIR = path.join(ROOT_DIR, '.tmp', 'host-real-results');
export const HOST_STATE_DIR = path.join(HOST_ROOT_DIR, 'state');
export const HOST_WORKSPACE_DIR = path.join(HOST_ROOT_DIR, 'workspace');
export const HOST_CONFIG_PATH = path.join(HOST_ROOT_DIR, 'openclaw.json');
export const FIXTURES_DIR = path.join(ROOT_DIR, 'fixtures', 'host-real');
export const MEMORY_PROBE_DIR = path.join(FIXTURES_DIR, 'probe-memory-slot');
export const CONTEXT_PROBE_DIR = path.join(FIXTURES_DIR, 'probe-context-engine-slot');
export const MEMPALACE_MCP_SHIM_PATH = path.join(FIXTURES_DIR, 'mempalace-mcp-shim.mjs');
export const MOCK_OPENAI_PROVIDER_PATH = path.join(
	FIXTURES_DIR,
	'mock-openai-provider.mjs',
);
export const MEMORY_MEMPALACE_DIR = path.join(ROOT_DIR, 'packages', 'memory-mempalace');
export const CONTEXT_ENGINE_MEMPALACE_DIR = path.join(
	ROOT_DIR,
	'packages',
	'context-engine-mempalace',
);
export const MEMPALACE_INGEST_HOOKS_DIR = path.join(
	ROOT_DIR,
	'packages',
	'mempalace-ingest-hooks',
);
export const MEMORY_PROBE_ID = 'probe-memory-slot';
export const CONTEXT_PROBE_ID = 'probe-context-engine-slot';
export const MEMORY_MEMPALACE_ID = 'memory-mempalace';
export const CONTEXT_ENGINE_MEMPALACE_ID = 'claw-context-mempalace';
export const MEMPALACE_INGEST_HOOKS_ID = '@mempalace-openclaw/mempalace-ingest-hooks';
export const MEMPALACE_INGEST_HOOK_EVIDENCE_ID = 'mempalace-ingest-hooks';
export const MEMPALACE_MCP_SHIM_STATE_PATH = path.join(
	HOST_ROOT_DIR,
	'mempalace-mcp-state.json',
);
export const MOCK_OPENAI_READY_PATH = path.join(
	RESULTS_DIR,
	'mock-openai-ready.json',
);
export const MOCK_OPENAI_REQUEST_LOG_PATH = path.join(
	RESULTS_DIR,
	'mock-openai-requests.jsonl',
);

export function hostEnv(extraEnv = {}) {
	return {
		...process.env,
		OPENCLAW_CONFIG_PATH: HOST_CONFIG_PATH,
		OPENCLAW_HOST_REAL_RESULTS_DIR: RESULTS_DIR,
		OPENCLAW_STATE_DIR: HOST_STATE_DIR,
		...extraEnv
	};
}

export function ensureDir(dirPath) {
	fs.mkdirSync(dirPath, { recursive: true });
}

export async function withTemporarilyDetachedNodeModules(pluginDir, callback) {
	const nodeModulesPath = path.join(pluginDir, 'node_modules');
	if (!fs.existsSync(nodeModulesPath)) {
		return callback();
	}

	const stashRoot = path.join(ROOT_DIR, '.tmp', 'detached-node-modules');
	ensureDir(stashRoot);
	const stashPath = path.join(
		stashRoot,
		`${path.basename(pluginDir)}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
	);

	try {
		fs.renameSync(nodeModulesPath, stashPath);
	} catch (error) {
		if (
			error &&
			typeof error === 'object' &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
			return callback();
		}
		throw error;
	}
	try {
		return await callback();
	} finally {
		if (fs.existsSync(stashPath)) {
			fs.renameSync(stashPath, nodeModulesPath);
		}
	}
}

export function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJson(filePath, value) {
	ensureDir(path.dirname(filePath));
	fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function resetHostWorkspace() {
	fs.rmSync(HOST_ROOT_DIR, { force: true, recursive: true });
	fs.rmSync(RESULTS_DIR, { force: true, recursive: true });
	ensureDir(HOST_ROOT_DIR);
	ensureDir(HOST_STATE_DIR);
	ensureDir(HOST_WORKSPACE_DIR);
	ensureDir(RESULTS_DIR);
}

export function runCommand(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: ROOT_DIR,
		encoding: 'utf8',
		env: options.env ?? process.env,
		stdio: 'pipe',
		timeout: options.timeoutMs,
	});

	if (result.error?.code === 'ETIMEDOUT') {
		throw new Error(`Command timed out: ${command} ${args.join(' ')}`);
	}

	if (result.status !== 0) {
		const details = [
			`Command failed: ${command} ${args.join(' ')}`,
			result.stdout?.trim() ? `stdout:\n${result.stdout.trim()}` : null,
			result.stderr?.trim() ? `stderr:\n${result.stderr.trim()}` : null
		]
			.filter(Boolean)
			.join('\n\n');
		throw new Error(details);
	}

	return {
		stderr: result.stderr ?? '',
		stdout: result.stdout ?? ''
	};
}

export function runOpenClaw(args, options = {}) {
	return runCommand('pnpm', ['exec', 'openclaw', ...args], {
		...options,
		env: hostEnv(options.extraEnv)
	});
}

export function spawnOpenClaw(args, options = {}) {
	const child = spawn('pnpm', ['exec', 'openclaw', ...args], {
		cwd: ROOT_DIR,
		encoding: 'utf8',
		env: hostEnv(options.extraEnv),
		stdio: 'pipe',
	});
	let stdout = '';
	let stderr = '';
	child.stdout.setEncoding('utf8');
	child.stderr.setEncoding('utf8');
	child.stdout.on('data', (chunk) => {
		stdout += chunk;
	});
	child.stderr.on('data', (chunk) => {
		stderr += chunk;
	});

	return {
		child,
		getOutput() {
			return { stderr, stdout };
		},
	};
}

export function bootstrapHostEnvironment() {
	resetHostWorkspace();
	const onboard = runOpenClaw([
		'onboard',
		'--non-interactive',
		'--accept-risk',
		'--mode',
		'local',
		'--workspace',
		HOST_WORKSPACE_DIR,
		'--skip-channels',
		'--skip-daemon',
		'--skip-health',
		'--skip-search',
		'--skip-skills',
		'--skip-ui',
		'--json'
	]);

	const version = runOpenClaw(['--version']).stdout.trim();
	const configPath = runOpenClaw(['config', 'file']).stdout.trim();

	const bootstrapReport = {
		configPath,
		hostVersion: version,
		installsFrom: 'npm package openclaw',
		openclawVersion: OPENCLAW_VERSION,
		platform: {
			arch: os.arch(),
			node: process.version,
			release: os.release(),
			type: os.type()
		},
		recordedAt: new Date().toISOString(),
		stateDir: HOST_STATE_DIR,
		stdout: onboard.stdout.trim(),
		workspaceDir: HOST_WORKSPACE_DIR
	};

	writeJson(path.join(RESULTS_DIR, 'bootstrap.json'), bootstrapReport);
	return bootstrapReport;
}

export function updateHostConfig(mutator) {
	const currentConfig = readJson(HOST_CONFIG_PATH);
	const nextConfig = mutator(structuredClone(currentConfig));
	writeJson(HOST_CONFIG_PATH, nextConfig);
	return nextConfig;
}

export function ensureLinkedPluginInstalled(pluginDir) {
	return runOpenClaw(['plugins', 'install', '--link', '--dangerously-force-unsafe-install', pluginDir]);
}

export function ensureProbeInstalled(pluginDir) {
	return ensureLinkedPluginInstalled(pluginDir);
}

export function inspectPlugin(pluginId) {
	return JSON.parse(runOpenClaw(['plugins', 'inspect', pluginId, '--json']).stdout);
}

export function validateConfig() {
	return JSON.parse(runOpenClaw(['config', 'validate', '--json']).stdout);
}

export function readProbeEvidence(pluginId) {
	const filePath = path.join(RESULTS_DIR, `${pluginId}.jsonl`);
	if (!fs.existsSync(filePath)) {
		return [];
	}
	return fs
		.readFileSync(filePath, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

export async function wait(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export async function waitForFile(filePath, timeoutMs = 10000) {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		if (fs.existsSync(filePath)) {
			return filePath;
		}
		await wait(100);
	}
	throw new Error(`Timed out waiting for file: ${filePath}`);
}

export function readJsonLines(filePath) {
	if (!fs.existsSync(filePath)) {
		return [];
	}
	return fs
		.readFileSync(filePath, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

export function buildBaseReport(name, extra = {}) {
	return {
		name,
		openclawVersion: OPENCLAW_VERSION,
		recordedAt: new Date().toISOString(),
		...extra
	};
}

export function runGatewayProbe(args = ['gateway', 'run', '--verbose']) {
	const child = spawnSync('pnpm', ['exec', 'openclaw', ...args], {
		cwd: ROOT_DIR,
		encoding: 'utf8',
		env: hostEnv(),
		timeout: 5000,
		stdio: 'pipe'
	});

	return {
		exitCode: child.status,
		signal: child.signal,
		stderr: child.stderr ?? '',
		stdout: child.stdout ?? '',
		timedOut: child.error?.code === 'ETIMEDOUT'
	};
}

export function buildMockProviderConfig(baseUrl) {
	return {
		agents: {
			defaults: {
				model: {
					primary: 'mock-openai/recall-model',
				},
				models: {
					'mock-openai/recall-model': {
						alias: 'Recall Mock',
					},
				},
			},
		},
		models: {
			providers: {
				'mock-openai': {
					api: 'openai-completions',
					apiKey: 'mock-openai-key',
					authHeader: true,
					baseUrl,
					models: [
						{
							contextWindow: 200000,
							cost: {
								cacheRead: 0,
								cacheWrite: 0,
								input: 0,
								output: 0,
							},
							id: 'recall-model',
							input: ['text'],
							maxTokens: 4096,
							name: 'Recall Mock Model',
							reasoning: false,
						},
					],
					request: {
						allowPrivateNetwork: true,
					},
				},
			},
		},
	};
}

export async function startMockOpenAIProvider(options = {}) {
	fs.rmSync(MOCK_OPENAI_READY_PATH, { force: true });
	fs.rmSync(MOCK_OPENAI_REQUEST_LOG_PATH, { force: true });

	const child = spawn(process.execPath, [MOCK_OPENAI_PROVIDER_PATH], {
		cwd: ROOT_DIR,
		env: {
			...process.env,
			MOCK_OPENAI_EXPECTED_NEEDLE:
				options.expectedNeedle ?? 'lemon pepper wings',
			MOCK_OPENAI_MEMORY_QUERY:
				options.memoryQuery ?? 'QA movie night snack lemon pepper wings blue cheese',
			MOCK_OPENAI_NEUTRAL_REPLY:
				options.neutralReply ??
				"I don't know your usual QA movie night snack.",
			MOCK_OPENAI_PORT: '0',
			MOCK_OPENAI_READY_PATH,
			MOCK_OPENAI_REQUEST_LOG_PATH,
			MOCK_OPENAI_SUCCESS_REPLY:
				options.successReply ?? 'You usually want lemon pepper wings.',
		},
		stdio: 'pipe',
	});

	child.stdout.setEncoding('utf8');
	child.stderr.setEncoding('utf8');

	await waitForFile(MOCK_OPENAI_READY_PATH, 10000);
	return {
		child,
		info: readJson(MOCK_OPENAI_READY_PATH),
	};
}

export async function stopChildProcess(child) {
	if (!child || child.killed) {
		return;
	}

	child.kill('SIGTERM');
	await new Promise((resolve) => {
		child.once('exit', () => resolve(undefined));
		setTimeout(() => resolve(undefined), 5000);
	});
}

export function buildMemoryPluginConfig(extraEnv = {}) {
	return {
		args: [MEMPALACE_MCP_SHIM_PATH],
		command: process.execPath,
		defaultResultLimit: 8,
		defaultTokenBudget: 1200,
		env: {
			MEMPALACE_MCP_SHIM_STATE_PATH,
			...extraEnv,
		},
		timeoutMs: 5000,
		transport: 'stdio',
	};
}

export function extractAgentReplyText(output) {
	if (typeof output === 'string') {
		return output;
	}
	if (!output || typeof output !== 'object') {
		return '';
	}

	const candidates = [
		output.finalAssistantVisibleText,
		output.finalAssistantRawText,
		output.reply,
		output.replyText,
		output.text,
		output.message,
		output.output_text,
		output.content,
		output.payloads?.[0]?.text,
		output.result?.text,
		output.result?.message,
		output.result?.content,
	];
	for (const candidate of candidates) {
		if (typeof candidate === 'string' && candidate.trim().length > 0) {
			return candidate;
		}
	}

	return '';
}
