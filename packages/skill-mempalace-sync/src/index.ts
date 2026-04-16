import { createSyncDaemon } from '@mempalace-openclaw/sync-daemon';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';

type CommandContext = {
	args?: string;
};

function parseBooleanFlag(args: string | undefined, flag: string): boolean {
	return (args ?? '').split(/\s+/).includes(flag);
}

function parseOptionValue(
	args: string | undefined,
	flag: string,
): string | undefined {
	const tokens = (args ?? '').split(/\s+/).filter(Boolean);
	const index = tokens.indexOf(flag);
	if (index < 0) {
		return undefined;
	}
	return tokens[index + 1];
}

function firstPositionalArg(args: string | undefined): string | undefined {
	return (args ?? '')
		.split(/\s+/)
		.filter((token) => token.length > 0 && !token.startsWith('--'))[0];
}

function registerCommands(
	api: Parameters<typeof definePluginEntry>[0]['register'] extends (
		arg: infer T,
	) => void
		? T
		: never,
): void {
	api.registerCommand({
		acceptsArgs: true,
		description: 'Add a source config from a JSON file path.',
		handler: async (ctx: CommandContext) => {
			const configPath =
				parseOptionValue(ctx.args, '--config') ?? firstPositionalArg(ctx.args);
			if (!configPath) {
				return {
					text: 'mempalace_sync_add_source requires a configPath or --config <file>.',
				};
			}
			const daemon = createSyncDaemon({ hostConfig: api.config });
			try {
				const source = daemon.addSourceFromFile(configPath);
				return { text: JSON.stringify(source, null, 2) };
			} finally {
				daemon.close();
			}
		},
		name: 'mempalace_sync_add_source',
	});

	api.registerCommand({
		acceptsArgs: true,
		description: 'List configured MemPalace sync sources.',
		handler: async (ctx: CommandContext) => {
			const daemon = createSyncDaemon({ hostConfig: api.config });
			try {
				return {
					text: JSON.stringify(
						daemon.listSources(parseBooleanFlag(ctx.args, '--enabled-only')),
						null,
						2,
					),
				};
			} finally {
				daemon.close();
			}
		},
		name: 'mempalace_sync_list_sources',
	});

	api.registerCommand({
		acceptsArgs: true,
		description:
			'Run MemPalace sync once for one source or all enabled sources.',
		handler: async (ctx: CommandContext) => {
			const daemon = createSyncDaemon({ hostConfig: api.config });
			try {
				const sourceId =
					parseOptionValue(ctx.args, '--source-id') ??
					firstPositionalArg(ctx.args);
				const result = await daemon.runOnce(
					sourceId ? { sourceId } : undefined,
				);
				return { text: JSON.stringify(result, null, 2) };
			} finally {
				daemon.close();
			}
		},
		name: 'mempalace_sync_run',
	});

	api.registerCommand({
		acceptsArgs: true,
		description: 'Show sync daemon status.',
		handler: async (ctx: CommandContext) => {
			const daemon = createSyncDaemon({ hostConfig: api.config });
			try {
				return {
					text: JSON.stringify(
						daemon.status(
							parseOptionValue(ctx.args, '--source-id') ??
								firstPositionalArg(ctx.args),
						),
						null,
						2,
					),
				};
			} finally {
				daemon.close();
			}
		},
		name: 'mempalace_sync_status',
	});

	api.registerCommand({
		acceptsArgs: true,
		description:
			'Remove a registered sync source without deleting promoted memory artifacts.',
		handler: async (ctx: CommandContext) => {
			const sourceId =
				parseOptionValue(ctx.args, '--source-id') ??
				firstPositionalArg(ctx.args);
			if (!sourceId) {
				return {
					text: 'mempalace_sync_remove_source requires sourceId or --source-id <id>.',
				};
			}
			const daemon = createSyncDaemon({ hostConfig: api.config });
			try {
				return {
					text: JSON.stringify(
						{ removed: daemon.removeSource(sourceId), sourceId },
						null,
						2,
					),
				};
			} finally {
				daemon.close();
			}
		},
		name: 'mempalace_sync_remove_source',
	});

	api.registerCommand({
		acceptsArgs: true,
		description:
			'Reindex one source or all enabled sources, optionally ignoring file hash cache.',
		handler: async (ctx: CommandContext) => {
			const daemon = createSyncDaemon({ hostConfig: api.config });
			try {
				const result = await daemon.reindex(
					parseOptionValue(ctx.args, '--source-id') ??
						firstPositionalArg(ctx.args),
					parseBooleanFlag(ctx.args, '--force'),
				);
				return { text: JSON.stringify(result, null, 2) };
			} finally {
				daemon.close();
			}
		},
		name: 'mempalace_sync_reindex',
	});
}

type CliCommandBuilder = {
	action<TOptions>(
		handler: (options: TOptions) => Promise<void> | void,
	): CliCommandBuilder;
	command(name: string): CliCommandBuilder;
	description(text: string): CliCommandBuilder;
	option(flag: string): CliCommandBuilder;
	requiredOption(flag: string): CliCommandBuilder;
};

function registerCli(
	api: Parameters<typeof definePluginEntry>[0]['register'] extends (
		arg: infer T,
	) => void
		? T
		: never,
): void {
	api.registerCli(
		async ({
			program,
		}: {
			program: { command(name: string): CliCommandBuilder };
		}) => {
			const root = program.command('mempalace-sync');
			root.description(
				'Manage MemPalace sync sources and run the sync daemon.',
			);

			root
				.command('add-source')
				.requiredOption('--config <file>')
				.option('--json')
				.action(async (options: { config: string; json?: boolean }) => {
					const daemon = createSyncDaemon({ hostConfig: api.config });
					try {
						const result = daemon.addSourceFromFile(options.config);
						process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
					} finally {
						daemon.close();
					}
				});

			root
				.command('list-sources')
				.option('--enabled-only')
				.option('--json')
				.action(async (options: { enabledOnly?: boolean }) => {
					const daemon = createSyncDaemon({ hostConfig: api.config });
					try {
						process.stdout.write(
							`${JSON.stringify(daemon.listSources(options.enabledOnly === true), null, 2)}\n`,
						);
					} finally {
						daemon.close();
					}
				});

			root
				.command('run')
				.option('--json')
				.option('--source-id <id>')
				.action(async (options: { sourceId?: string }) => {
					const daemon = createSyncDaemon({ hostConfig: api.config });
					try {
						process.stdout.write(
							`${JSON.stringify(
								await daemon.runOnce(
									options.sourceId ? { sourceId: options.sourceId } : undefined,
								),
								null,
								2,
							)}\n`,
						);
					} finally {
						daemon.close();
					}
				});

			root
				.command('status')
				.option('--json')
				.option('--source-id <id>')
				.action(async (options: { sourceId?: string }) => {
					const daemon = createSyncDaemon({ hostConfig: api.config });
					try {
						process.stdout.write(
							`${JSON.stringify(daemon.status(options.sourceId), null, 2)}\n`,
						);
					} finally {
						daemon.close();
					}
				});

			root
				.command('remove-source')
				.requiredOption('--source-id <id>')
				.action(async (options: { sourceId: string }) => {
					const daemon = createSyncDaemon({ hostConfig: api.config });
					try {
						process.stdout.write(
							`${JSON.stringify({ removed: daemon.removeSource(options.sourceId), sourceId: options.sourceId }, null, 2)}\n`,
						);
					} finally {
						daemon.close();
					}
				});

			root
				.command('reindex')
				.option('--force')
				.option('--json')
				.option('--source-id <id>')
				.action(async (options: { force?: boolean; sourceId?: string }) => {
					const daemon = createSyncDaemon({ hostConfig: api.config });
					try {
						process.stdout.write(
							`${JSON.stringify(await daemon.reindex(options.sourceId, options.force === true), null, 2)}\n`,
						);
					} finally {
						daemon.close();
					}
				});
		},
		{
			descriptors: [
				{
					description: 'Manage MemPalace sync sources and run sync jobs.',
					hasSubcommands: true,
					name: 'mempalace-sync',
				},
			],
		},
	);
}

export default definePluginEntry({
	description:
		'Operational MemPalace sync commands and CLI for source registration, runs and reindexing.',
	id: 'skill-mempalace-sync',
	name: 'MemPalace Sync Commands',
	register(api) {
		registerCommands(api as never);
		registerCli(api as never);
	},
});
