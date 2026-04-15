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
export const MEMORY_MEMPALACE_DIR = path.join(ROOT_DIR, 'packages', 'memory-mempalace');
export const MEMPALACE_INGEST_HOOKS_DIR = path.join(
	ROOT_DIR,
	'packages',
	'mempalace-ingest-hooks',
);
export const MEMORY_PROBE_ID = 'probe-memory-slot';
export const CONTEXT_PROBE_ID = 'probe-context-engine-slot';
export const MEMORY_MEMPALACE_ID = 'memory-mempalace';
export const MEMPALACE_INGEST_HOOKS_ID = '@mempalace-openclaw/mempalace-ingest-hooks';
export const MEMPALACE_INGEST_HOOK_EVIDENCE_ID = 'mempalace-ingest-hooks';

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

	fs.renameSync(nodeModulesPath, stashPath);
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
