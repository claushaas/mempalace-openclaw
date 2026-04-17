import { type ChildProcess, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RUNTIME_PACKAGES = [
	'@mempalace-openclaw/shared',
	'@mempalace-openclaw/memory-mempalace',
	'@mempalace-openclaw/context-engine-mempalace',
	'@mempalace-openclaw/sync-daemon',
	'@mempalace-openclaw/skill-mempalace-sync',
] as const;

export type DevMode = 'runtime' | 'tests' | 'all' | 'daemon';

export type CommandSpec = {
	args: string[];
	command: string;
	label: string;
};

export function parseDevArgs(argv: string[]): {
	mode: DevMode;
	passthrough: string[];
} {
	const [requestedMode = 'runtime', ...rest] = argv;

	if (requestedMode === 'runtime') {
		return { mode: 'runtime', passthrough: rest };
	}
	if (requestedMode === 'tests') {
		return { mode: 'tests', passthrough: rest };
	}
	if (requestedMode === 'all') {
		return { mode: 'all', passthrough: rest };
	}
	if (requestedMode === 'daemon') {
		const passthrough = rest[0] === '--' ? rest.slice(1) : rest;
		return { mode: 'daemon', passthrough };
	}

	if (requestedMode.startsWith('-')) {
		throw new Error(`Unknown dev mode: ${requestedMode}`);
	}

	return { mode: 'runtime', passthrough: argv };
}

function createRuntimeSpecs(): CommandSpec[] {
	return RUNTIME_PACKAGES.map((pkg) => ({
		args: ['--filter', pkg, 'run', 'build', '--', '--watch'],
		command: 'pnpm',
		label: `build:${pkg}`,
	}));
}

export function buildCommandSpecs(
	mode: DevMode,
	passthrough: string[] = [],
): CommandSpec[] {
	if (mode === 'runtime') {
		return createRuntimeSpecs();
	}
	if (mode === 'tests') {
		return [
			{
				args: [
					'exec',
					'vitest',
					'--watch',
					'--passWithNoTests',
					...passthrough,
				],
				command: 'pnpm',
				label: 'tests',
			},
		];
	}
	if (mode === 'all') {
		return [
			...createRuntimeSpecs(),
			{
				args: [
					'exec',
					'vitest',
					'--watch',
					'--passWithNoTests',
					...passthrough,
				],
				command: 'pnpm',
				label: 'tests',
			},
		];
	}

	return [
		{
			args: [
				'exec',
				'tsx',
				'watch',
				'packages/sync-daemon/src/bin.ts',
				...passthrough,
			],
			command: 'pnpm',
			label: 'daemon',
		},
	];
}

export async function runDevMode(
	mode: DevMode,
	passthrough: string[] = [],
): Promise<void> {
	const specs = buildCommandSpecs(mode, passthrough);
	const children = specs.map((spec) =>
		spawn(spec.command, spec.args, {
			env: process.env,
			stdio: 'inherit',
		}),
	);

	await waitForChildren(children);
}

function terminateChildren(children: ChildProcess[]) {
	for (const child of children) {
		if (child.killed || child.exitCode !== null) {
			continue;
		}
		child.kill('SIGTERM');
	}
}

async function waitForChildren(children: ChildProcess[]) {
	await new Promise<void>((resolve, reject) => {
		let settled = false;

		const finish = (error?: Error) => {
			if (settled) {
				return;
			}
			settled = true;
			terminateChildren(children);
			if (error) {
				reject(error);
				return;
			}
			resolve();
		};

		for (const signal of ['SIGINT', 'SIGTERM'] as const) {
			process.once(signal, () => finish());
		}

		for (const child of children) {
			child.once('error', (error) => {
				finish(error);
			});
			child.once('exit', (code, signal) => {
				if (signal || (code !== null && code !== 0)) {
					finish(
						new Error(
							`Dev command failed with code=${code ?? 'null'} signal=${signal ?? 'none'}.`,
						),
					);
					return;
				}

				if (children.every((current) => current.exitCode !== null)) {
					finish();
				}
			});
		}
	});
}

async function runCli() {
	const { mode, passthrough } = parseDevArgs(process.argv.slice(2));
	await runDevMode(mode, passthrough);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	runCli().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	});
}
