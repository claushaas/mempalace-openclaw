import { createSyncDaemon } from '../jobs/sync-daemon.js';

function readOption(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	if (index < 0) {
		return undefined;
	}
	return args[index + 1];
}

function hasFlag(args: string[], name: string): boolean {
	return args.includes(name);
}

function printResult(value: unknown, asJson: boolean): void {
	if (asJson) {
		process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
		return;
	}
	if (typeof value === 'string') {
		process.stdout.write(`${value}\n`);
		return;
	}
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function runSyncDaemonCli(
	args: string[],
	hostConfig: unknown,
): Promise<number> {
	const daemon = createSyncDaemon({ hostConfig });
	const [command, ...rest] = args;

	try {
		switch (command) {
			case 'add-source': {
				const configPath = readOption(rest, '--config');
				if (!configPath) {
					throw new Error('Missing --config <file>.');
				}
				printResult(
					daemon.addSourceFromFile(configPath),
					hasFlag(rest, '--json'),
				);
				return 0;
			}
			case 'list-sources': {
				printResult(
					daemon.listSources(hasFlag(rest, '--enabled-only')),
					hasFlag(rest, '--json'),
				);
				return 0;
			}
			case 'remove-source': {
				const sourceId = readOption(rest, '--source-id');
				if (!sourceId) {
					throw new Error('Missing --source-id <id>.');
				}
				printResult(
					{ removed: daemon.removeSource(sourceId), sourceId },
					hasFlag(rest, '--json'),
				);
				return 0;
			}
			case 'reindex': {
				const result = await daemon.reindex(
					readOption(rest, '--source-id'),
					hasFlag(rest, '--force'),
				);
				printResult(result, hasFlag(rest, '--json'));
				return 0;
			}
			case 'run':
			case 'run-once': {
				const sourceId = readOption(rest, '--source-id');
				const result = await daemon.runOnce(
					sourceId ? { sourceId } : undefined,
				);
				printResult(result, hasFlag(rest, '--json'));
				return 0;
			}
			case 'run-scheduled': {
				const result = await daemon.runScheduled();
				printResult(result, hasFlag(rest, '--json'));
				return 0;
			}
			case 'status': {
				printResult(
					daemon.status(readOption(rest, '--source-id')),
					hasFlag(rest, '--json'),
				);
				return 0;
			}
			default:
				printResult(
					{
						commands: [
							'add-source --config <file>',
							'list-sources [--enabled-only] [--json]',
							'run [--source-id <id>] [--json]',
							'status [--source-id <id>] [--json]',
							'remove-source --source-id <id> [--json]',
							'reindex [--source-id <id>] [--force] [--json]',
							'run-scheduled [--json]',
						],
					},
					true,
				);
				return 0;
		}
	} finally {
		daemon.close();
	}
}
