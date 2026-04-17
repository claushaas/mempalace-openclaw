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
		advanced: {
			additionalProperties: false,
			properties: {
				agentDiaries: { type: 'boolean' },
				knowledgeGraph: { type: 'boolean' },
				lowConfidenceScoreThreshold: {
					minimum: 0,
					type: 'number',
				},
				maxExpandedTerms: {
					minimum: 1,
					type: 'integer',
				},
				pinnedMemory: { type: 'boolean' },
				queryExpansion: { type: 'boolean' },
			},
			type: 'object',
		},
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

const AdvancedMemoryFeaturesSchema = z
	.object({
		agentDiaries: z.boolean().default(false),
		knowledgeGraph: z.boolean().default(false),
		lowConfidenceScoreThreshold: z.number().min(0).default(0.45),
		maxExpandedTerms: z.number().int().positive().default(5),
		pinnedMemory: z.boolean().default(false),
		queryExpansion: z.boolean().default(false),
	})
	.strict();

export const MemoryMempalacePluginConfigSchema = z
	.object({
		advanced: AdvancedMemoryFeaturesSchema.default(() =>
			AdvancedMemoryFeaturesSchema.parse({}),
		),
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

export type ResolvedMemoryMempalaceAdvancedConfig = z.infer<
	typeof AdvancedMemoryFeaturesSchema
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
		advanced: {
			...AdvancedMemoryFeaturesSchema.parse(parsed.advanced ?? {}),
		},
	};
}

export function getMemoryMempalacePluginConfigFingerprint(
	config: ResolvedMemoryMempalacePluginConfig,
): string {
	return createFingerprint(config as JsonValue);
}
