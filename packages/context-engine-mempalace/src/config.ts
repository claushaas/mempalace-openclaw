import {
	type JsonValue,
	parseWithSchema,
	SchemaValidationError,
} from '@mempalace-openclaw/shared';
import { buildPluginConfigSchema } from 'openclaw/plugin-sdk/plugin-entry';
import { z } from 'zod';

export const contextEngineMempalacePluginConfigJsonSchema = {
	additionalProperties: false,
	properties: {
		compaction: {
			additionalProperties: false,
			properties: {
				enabled: {
					type: 'boolean',
				},
				maxCompactedEntries: {
					minimum: 1,
					type: 'integer',
				},
				overflowSummaryMaxChars: {
					minimum: 1,
					type: 'integer',
				},
			},
			type: 'object',
		},
		includeMemoryPromptAddition: {
			type: 'boolean',
		},
		maxArtifactLines: {
			minimum: 1,
			type: 'integer',
		},
		maxContextTokens: {
			minimum: 1,
			type: 'integer',
		},
		maxEntries: {
			minimum: 1,
			type: 'integer',
		},
		minScore: {
			minimum: 0,
			type: 'number',
		},
	},
	type: 'object',
} as const;

export const ContextEngineMempalacePluginConfigSchema = z
	.object({
		compaction: z
			.object({
				enabled: z.boolean().default(false),
				maxCompactedEntries: z.number().int().positive().default(4),
				overflowSummaryMaxChars: z.number().int().positive().default(320),
			})
			.strict()
			.default(() =>
				z
					.object({
						enabled: z.boolean().default(false),
						maxCompactedEntries: z.number().int().positive().default(4),
						overflowSummaryMaxChars: z.number().int().positive().default(320),
					})
					.strict()
					.parse({}),
			),
		includeMemoryPromptAddition: z.boolean().default(true),
		maxArtifactLines: z.number().int().positive().default(40),
		maxContextTokens: z.number().int().positive().default(1200),
		maxEntries: z.number().int().positive().default(6),
		minScore: z.number().min(0).default(0.15),
	})
	.strict();

export const contextEngineMempalacePluginConfigSchema = buildPluginConfigSchema(
	ContextEngineMempalacePluginConfigSchema,
);

export type ContextEngineMempalacePluginConfig = z.infer<
	typeof ContextEngineMempalacePluginConfigSchema
>;

export type ResolvedContextEngineMempalacePluginConfig =
	Required<ContextEngineMempalacePluginConfig>;

export function parseContextEngineMempalacePluginConfig(
	input: unknown,
): ResolvedContextEngineMempalacePluginConfig {
	return parseWithSchema(
		ContextEngineMempalacePluginConfigSchema,
		input ?? {},
		'Invalid claw-context-mempalace plugin config.',
	);
}

export function assertContextEngineConfigSerializable(
	config: ContextEngineMempalacePluginConfig,
): asserts config is ContextEngineMempalacePluginConfig {
	try {
		JSON.stringify(config as JsonValue);
	} catch (error) {
		throw new SchemaValidationError(
			'claw-context-mempalace config must remain JSON-serializable.',
			undefined,
			error,
		);
	}
}
