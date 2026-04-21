import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SourceConfigSchema } from '../packages/shared/src/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const EXAMPLES_DIR = path.join(ROOT_DIR, 'examples');
const MEMORY_PLUGIN_DIR = path.join(ROOT_DIR, 'packages', 'memory-mempalace');
const CONTEXT_PLUGIN_DIR = path.join(
	ROOT_DIR,
	'packages',
	'context-engine-mempalace',
);

type ValidationStatus = 'validated' | 'failed';

type ValidationResult = {
	file: string;
	message: string;
	status: ValidationStatus;
	type: 'json' | 'source-config' | 'openclaw-config';
};

export function partitionExampleFiles(files: string[]) {
	const jsonFiles = files.filter((file) => file.endsWith('.json'));
	const sourceConfigs = jsonFiles.filter((file) =>
		/(obsidian-source|repo-source)\.json$/.test(file),
	);
	const openClawConfigs = jsonFiles.filter((file) =>
		/openclaw\.config\..+\.json$/.test(file),
	);

	return {
		jsonFiles,
		openClawConfigs,
		sourceConfigs,
	};
}

export function buildValidationSummary(results: ValidationResult[]) {
	const failed = results.filter((result) => result.status === 'failed');
	return {
		failed,
		ok: failed.length === 0,
		total: results.length,
	};
}

function runCommand(
	command: string,
	args: string[],
	options: {
		cwd?: string;
		env?: NodeJS.ProcessEnv;
	} = {},
) {
	const result = spawnSync(command, args, {
		cwd: options.cwd ?? ROOT_DIR,
		encoding: 'utf8',
		env: options.env ?? process.env,
		stdio: 'pipe',
	});

	if (result.status !== 0) {
		throw new Error(
			[
				`Command failed: ${command} ${args.join(' ')}`,
				result.stdout.trim() ? `stdout:\n${result.stdout.trim()}` : null,
				result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : null,
			]
				.filter(Boolean)
				.join('\n\n'),
		);
	}

	return result.stdout;
}

function copyInstallablePackage(sourceDir: string, destinationDir: string) {
	fs.cpSync(sourceDir, destinationDir, {
		filter: (entry) => {
			const baseName = path.basename(entry);
			return baseName !== 'node_modules' && baseName !== '.vite';
		},
		force: true,
		recursive: true,
	});

	const sourceNodeModules = path.join(sourceDir, 'node_modules');
	if (!fs.existsSync(sourceNodeModules)) {
		return;
	}

	fs.cpSync(sourceNodeModules, path.join(destinationDir, 'node_modules'), {
		dereference: true,
		filter: (entry) => path.basename(entry) !== '.vite',
		force: true,
		recursive: true,
	});
}

function stagePluginForValidation(pluginDir: string, tempRoot: string): string {
	const stageRoot = path.join(tempRoot, 'linked-packages');
	const stageDir = path.join(stageRoot, path.basename(pluginDir));
	fs.mkdirSync(stageRoot, { recursive: true });
	fs.rmSync(stageDir, { force: true, recursive: true });
	copyInstallablePackage(pluginDir, stageDir);
	return stageDir;
}

function validateJsonFile(filePath: string): ValidationResult {
	try {
		JSON.parse(fs.readFileSync(filePath, 'utf8'));
		return {
			file: path.relative(ROOT_DIR, filePath),
			message: 'JSON parsed successfully.',
			status: 'validated',
			type: 'json',
		};
	} catch (error) {
		return {
			file: path.relative(ROOT_DIR, filePath),
			message: error instanceof Error ? error.message : String(error),
			status: 'failed',
			type: 'json',
		};
	}
}

function validateSourceConfigFile(filePath: string): ValidationResult {
	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
		SourceConfigSchema.parse(parsed);
		return {
			file: path.relative(ROOT_DIR, filePath),
			message: 'SourceConfigSchema accepted the file.',
			status: 'validated',
			type: 'source-config',
		};
	} catch (error) {
		return {
			file: path.relative(ROOT_DIR, filePath),
			message: error instanceof Error ? error.message : String(error),
			status: 'failed',
			type: 'source-config',
		};
	}
}

function hostEnv(configPath: string, stateDir: string) {
	return {
		...process.env,
		OPENCLAW_CONFIG_PATH: configPath,
		OPENCLAW_STATE_DIR: stateDir,
	};
}

function mergeConfig(base: unknown, overlay: unknown): unknown {
	if (
		base &&
		overlay &&
		typeof base === 'object' &&
		typeof overlay === 'object' &&
		!Array.isArray(base) &&
		!Array.isArray(overlay)
	) {
		const result: Record<string, unknown> = {
			...(base as Record<string, unknown>),
		};
		for (const [key, value] of Object.entries(
			overlay as Record<string, unknown>,
		)) {
			result[key] = key in result ? mergeConfig(result[key], value) : value;
		}
		return result;
	}

	return overlay;
}

function createValidationHost(exampleFile: string) {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), 'mempalace-openclaw-validate-'),
	);
	const configPath = path.join(tempRoot, 'openclaw.json');
	const stateDir = path.join(tempRoot, 'state');
	const workspaceDir = path.join(tempRoot, 'workspace');
	const env = hostEnv(configPath, stateDir);

	runCommand(
		'pnpm',
		[
			'exec',
			'openclaw',
			'onboard',
			'--non-interactive',
			'--accept-risk',
			'--mode',
			'local',
			'--workspace',
			workspaceDir,
			'--skip-channels',
			'--skip-daemon',
			'--skip-health',
			'--skip-search',
			'--skip-skills',
			'--skip-ui',
			'--json',
		],
		{ env },
	);

	const stagedMemoryPluginDir = stagePluginForValidation(
		MEMORY_PLUGIN_DIR,
		tempRoot,
	);
	runCommand(
		'pnpm',
		[
			'exec',
			'openclaw',
			'plugins',
			'install',
			'--link',
			'--dangerously-force-unsafe-install',
			stagedMemoryPluginDir,
		],
		{ env },
	);

	const stagedContextPluginDir = stagePluginForValidation(
		CONTEXT_PLUGIN_DIR,
		tempRoot,
	);
	runCommand(
		'pnpm',
		[
			'exec',
			'openclaw',
			'plugins',
			'install',
			'--link',
			'--dangerously-force-unsafe-install',
			stagedContextPluginDir,
		],
		{ env },
	);

	const onboardConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
	const exampleConfig = JSON.parse(fs.readFileSync(exampleFile, 'utf8'));
	fs.writeFileSync(
		configPath,
		`${JSON.stringify(mergeConfig(onboardConfig, exampleConfig), null, 2)}\n`,
	);

	return { configPath, env, stateDir, tempRoot };
}

function validateOpenClawConfigFile(filePath: string): ValidationResult {
	let tempRoot: string | undefined;
	try {
		const host = createValidationHost(filePath);
		tempRoot = host.tempRoot;
		const output = runCommand(
			'pnpm',
			['exec', 'openclaw', 'config', 'validate', '--json'],
			{
				env: hostEnv(host.configPath, host.stateDir),
			},
		);
		const parsed = JSON.parse(output) as {
			issues?: unknown[];
			valid?: boolean;
		};
		if (!parsed.valid) {
			throw new Error(
				`OpenClaw rejected the config: ${JSON.stringify(parsed.issues ?? [], null, 2)}`,
			);
		}

		return {
			file: path.relative(ROOT_DIR, filePath),
			message: 'openclaw config validate --json accepted the config.',
			status: 'validated',
			type: 'openclaw-config',
		};
	} catch (error) {
		return {
			file: path.relative(ROOT_DIR, filePath),
			message: error instanceof Error ? error.message : String(error),
			status: 'failed',
			type: 'openclaw-config',
		};
	} finally {
		if (tempRoot) {
			fs.rmSync(tempRoot, { force: true, recursive: true });
		}
	}
}

export async function runValidateConfig(): Promise<number> {
	const exampleFiles = fs
		.readdirSync(EXAMPLES_DIR)
		.map((entry) => path.join(EXAMPLES_DIR, entry));
	const { jsonFiles, openClawConfigs, sourceConfigs } =
		partitionExampleFiles(exampleFiles);

	const results = [
		...jsonFiles.map(validateJsonFile),
		...sourceConfigs.map(validateSourceConfigFile),
		...openClawConfigs.map(validateOpenClawConfigFile),
	];
	const summary = buildValidationSummary(results);

	for (const result of results) {
		const prefix = result.status === 'validated' ? 'validated' : 'failed';
		console.log(`${prefix} [${result.type}] ${result.file}`);
		if (result.status === 'failed') {
			console.error(result.message);
		}
	}

	console.log(
		`Validation summary: ${summary.total - summary.failed.length}/${summary.total} checks passed.`,
	);
	return summary.ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	runValidateConfig()
		.then((exitCode) => {
			process.exit(exitCode);
		})
		.catch((error: unknown) => {
			console.error(error instanceof Error ? error.message : error);
			process.exit(1);
		});
}
