import {
	createFingerprint,
	type JsonValue,
	parseWithSchema,
	SchemaValidationError,
} from '@mempalace-openclaw/shared';
import { buildPluginConfigSchema } from 'openclaw/plugin-sdk/plugin-entry';
import { z } from 'zod';

export const memoryMempalacePluginConfigJsonSchema = {
	additionalProperties: false,
	properties: {
		args: {
			items: {
				type: 'string',
			},
			type: 'array',
		},
		command: {
			minLength: 1,
			type: 'string',
		},
		cwd: {
			minLength: 1,
			type: 'string',
		},
		defaultResultLimit: {
			minimum: 1,
			type: 'integer',
		},
		defaultTokenBudget: {
			minimum: 1,
			type: 'integer',
		},
		env: {
			additionalProperties: {
				type: 'string',
			},
			type: 'object',
		},
		timeoutMs: {
			minimum: 1,
			type: 'integer',
		},
		transport: {
			enum: ['stdio'],
			type: 'string',
		},
	},
	type: 'object',
} as const;

const nonEmptyStringSchema = z.string().min(1);

export const MemoryMempalacePluginConfigSchema = z
	.object({
		args: z.array(nonEmptyStringSchema).optional(),
		command: nonEmptyStringSchema.optional(),
		cwd: nonEmptyStringSchema.optional(),
		defaultResultLimit: z.number().int().positive().optional(),
		defaultTokenBudget: z.number().int().positive().optional(),
		env: z.record(z.string(), z.string()).optional(),
		timeoutMs: z.number().int().positive().optional(),
		transport: z.literal('stdio').default('stdio'),
	})
	.strict();

export const memoryMempalacePluginConfigSchema = buildPluginConfigSchema(
	MemoryMempalacePluginConfigSchema,
);

export type MemoryMempalacePluginConfig = z.infer<
	typeof MemoryMempalacePluginConfigSchema
>;

export type ResolvedMemoryMempalacePluginConfig = Required<
	Pick<
		MemoryMempalacePluginConfig,
		'defaultResultLimit' | 'defaultTokenBudget' | 'timeoutMs' | 'transport'
	>
> &
	Omit<
		MemoryMempalacePluginConfig,
		'defaultResultLimit' | 'defaultTokenBudget' | 'timeoutMs' | 'transport'
	>;

const DEFAULT_CONFIG_VALUES = {
	defaultResultLimit: 8,
	defaultTokenBudget: 1200,
	timeoutMs: 5000,
	transport: 'stdio',
} as const satisfies Pick<
	ResolvedMemoryMempalacePluginConfig,
	'defaultResultLimit' | 'defaultTokenBudget' | 'timeoutMs' | 'transport'
>;

export function parseMemoryMempalacePluginConfig(
	input: unknown,
	options?: {
		allowEmpty?: boolean;
	},
): ResolvedMemoryMempalacePluginConfig {
	const raw = input ?? {};
	const parsed = parseWithSchema(
		MemoryMempalacePluginConfigSchema,
		raw,
		'Invalid memory-mempalace plugin config.',
	);

	if (!options?.allowEmpty && !parsed.command) {
		throw new SchemaValidationError(
			'memory-mempalace requires `command` in runtime config.',
		);
	}

	return {
		...DEFAULT_CONFIG_VALUES,
		...parsed,
	};
}

export function getMemoryMempalacePluginConfigFingerprint(
	config: ResolvedMemoryMempalacePluginConfig,
): string {
	return createFingerprint(config as JsonValue);
}
