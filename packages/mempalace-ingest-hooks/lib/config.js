import { createFingerprint } from './contracts.js';

function getPluginEntryConfig(cfg) {
	return cfg?.plugins?.entries?.['memory-mempalace']?.config ?? {};
}

export function resolveMemoryBackendConfig(cfg) {
	const config = getPluginEntryConfig(cfg);
	const command =
		typeof config.command === 'string' ? config.command.trim() : '';
	if (command.length === 0) {
		const error = new Error(
			'mempalace-ingest-hooks requires plugins.entries.memory-mempalace.config.command.',
		);
		error.name = 'BackendUnavailableError';
		throw error;
	}

	return {
		args: Array.isArray(config.args)
			? config.args.filter((value) => typeof value === 'string')
			: [],
		command,
		cwd:
			typeof config.cwd === 'string' && config.cwd.length > 0
				? config.cwd
				: undefined,
		env:
			config.env && typeof config.env === 'object' && !Array.isArray(config.env)
				? Object.fromEntries(
						Object.entries(config.env).filter(
							([, value]) => typeof value === 'string',
						),
					)
				: undefined,
		timeoutMs:
			typeof config.timeoutMs === 'number' && Number.isFinite(config.timeoutMs)
				? config.timeoutMs
				: 5000,
		transport: 'stdio',
	};
}

export function getMemoryBackendFingerprint(cfg) {
	return createFingerprint(resolveMemoryBackendConfig(cfg));
}
