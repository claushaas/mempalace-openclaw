import {
	BackendUnavailableError,
	createFingerprint,
	type JsonValue,
	SchemaValidationError,
} from '@mempalace-openclaw/shared';

export type MemoryBackendConfig = {
	args: string[];
	command: string;
	cwd?: string | undefined;
	env?: Record<string, string> | undefined;
	timeoutMs: number;
	transport: 'stdio';
};

function coerceStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter(
				(entry): entry is string =>
					typeof entry === 'string' && entry.trim().length > 0,
			)
		: [];
}

export function resolveMemoryBackendConfig(cfg: unknown): MemoryBackendConfig {
	const config =
		cfg && typeof cfg === 'object'
			? (
					cfg as {
						plugins?: { entries?: Record<string, { config?: unknown }> };
					}
				).plugins?.entries?.['memory-mempalace']?.config
			: undefined;
	const raw =
		config && typeof config === 'object' && !Array.isArray(config)
			? config
			: {};
	const command =
		typeof (raw as { command?: unknown }).command === 'string'
			? ((raw as { command?: string }).command?.trim() ?? '')
			: '';

	if (command.length === 0) {
		throw new BackendUnavailableError(
			'sync-daemon requires plugins.entries.memory-mempalace.config.command.',
		);
	}

	const transport = (raw as { transport?: unknown }).transport;
	if (transport !== undefined && transport !== 'stdio') {
		throw new SchemaValidationError(
			'sync-daemon only supports plugins.entries.memory-mempalace.config.transport = "stdio".',
		);
	}

	const env = (raw as { env?: unknown }).env;
	return {
		args: coerceStringArray((raw as { args?: unknown }).args),
		command,
		cwd:
			typeof (raw as { cwd?: unknown }).cwd === 'string' &&
			(raw as { cwd?: string }).cwd?.trim()
				? (raw as { cwd?: string }).cwd?.trim()
				: undefined,
		env:
			env && typeof env === 'object' && !Array.isArray(env)
				? Object.fromEntries(
						Object.entries(env).filter((entry) => typeof entry[1] === 'string'),
					)
				: undefined,
		timeoutMs:
			typeof (raw as { timeoutMs?: unknown }).timeoutMs === 'number' &&
			Number.isFinite((raw as { timeoutMs?: number }).timeoutMs)
				? Math.max(
						1,
						Math.floor((raw as { timeoutMs?: number }).timeoutMs ?? 5000),
					)
				: 5000,
		transport: 'stdio',
	};
}

export function getMemoryBackendFingerprint(cfg: unknown): string {
	return createFingerprint(
		resolveMemoryBackendConfig(cfg) as unknown as JsonValue,
	);
}
