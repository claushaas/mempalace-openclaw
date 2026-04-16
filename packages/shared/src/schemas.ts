import { z } from 'zod';

import {
	HOOK_ENVELOPE_VERSION_VALUES,
	JOB_STATUS_VALUES,
	MEMORY_TYPE_VALUES,
	RUNTIME_HEALTH_STATUS_VALUES,
	RUNTIME_REFRESH_REASON_VALUES,
	SESSION_CLASSIFICATION_VALUES,
	SOURCE_KIND_VALUES,
} from './constants.js';
import { type JsonValue, JsonValueSchema } from './serializable.js';

const nonEmptyStringSchema = z.string().min(1);

const isoDatetimeStringSchema = nonEmptyStringSchema.refine(
	(value) => !Number.isNaN(Date.parse(value)),
	{
		message: 'Expected an ISO 8601 datetime string.',
	},
);

export const MemoryTypeSchema = z.enum(MEMORY_TYPE_VALUES);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

export const SessionClassificationSchema = z.enum(
	SESSION_CLASSIFICATION_VALUES,
);
export type SessionClassification = z.infer<typeof SessionClassificationSchema>;

export const SourceKindSchema = z.enum(SOURCE_KIND_VALUES);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const JobStatusSchema = z.enum(JOB_STATUS_VALUES);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const RuntimeRefreshReasonSchema = z.enum(RUNTIME_REFRESH_REASON_VALUES);
export type RuntimeRefreshReason = z.infer<typeof RuntimeRefreshReasonSchema>;

export const RuntimeHealthStatusSchema = z.enum(RUNTIME_HEALTH_STATUS_VALUES);
export type RuntimeHealthStatus = z.infer<typeof RuntimeHealthStatusSchema>;

export const HookEnvelopeVersionSchema = z.enum(HOOK_ENVELOPE_VERSION_VALUES);
export type HookEnvelopeVersion = z.infer<typeof HookEnvelopeVersionSchema>;

export const ProvenanceSchema = z.object({
	classification: SessionClassificationSchema,
	source: nonEmptyStringSchema,
	sourcePath: nonEmptyStringSchema,
	sourceType: nonEmptyStringSchema,
	updatedAt: isoDatetimeStringSchema,
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const SourceDefaultsSchema = z
	.object({
		hall: nonEmptyStringSchema.optional(),
		wing: nonEmptyStringSchema.optional(),
	})
	.strict();
export type SourceDefaults = z.infer<typeof SourceDefaultsSchema>;

export const SourceConfigSchema = z
	.object({
		defaults: SourceDefaultsSchema.optional(),
		exclude: z.array(nonEmptyStringSchema).optional(),
		id: nonEmptyStringSchema,
		include: z.array(nonEmptyStringSchema).optional(),
		kind: SourceKindSchema,
		mode: nonEmptyStringSchema.optional(),
		path: nonEmptyStringSchema,
		schedule: nonEmptyStringSchema.optional(),
	})
	.strict();
export type SourceConfig = z.infer<typeof SourceConfigSchema>;

export const SourceStatusSchema = z
	.object({
		enabled: z.boolean(),
		kind: SourceKindSchema,
		lastSyncedAt: isoDatetimeStringSchema.optional(),
		path: nonEmptyStringSchema,
		sourceId: nonEmptyStringSchema,
		syncStatus: JobStatusSchema.optional(),
	})
	.strict();
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

export const RuntimeHealthSchema = z
	.object({
		backendReachable: z.boolean(),
		lastRefreshAt: isoDatetimeStringSchema.optional(),
		message: nonEmptyStringSchema.optional(),
		status: RuntimeHealthStatusSchema,
	})
	.strict();
export type RuntimeHealth = z.infer<typeof RuntimeHealthSchema>;

export const MemoryStatusCacheSchema = z
	.object({
		artifactEntries: z.number().int().nonnegative(),
		lastInvalidatedAt: isoDatetimeStringSchema.optional(),
		lastRefreshAt: isoDatetimeStringSchema.optional(),
		lastRefreshReason: RuntimeRefreshReasonSchema.optional(),
		metadataEntries: z.number().int().nonnegative(),
		stale: z.boolean(),
	})
	.strict();
export type MemoryStatusCache = z.infer<typeof MemoryStatusCacheSchema>;

export const MemoryStatusDiagnosticsSchema = z
	.object({
		duplicateResultsCollapsed: z.number().int().nonnegative(),
		keywordFallbackApplied: z.boolean(),
		lastRefreshLatencyMs: z.number().nonnegative().optional(),
		lastSearchLatencyMs: z.number().nonnegative().optional(),
		rankingProfile: z.literal('v2'),
	})
	.strict();
export type MemoryStatusDiagnostics = z.infer<
	typeof MemoryStatusDiagnosticsSchema
>;

export const MemorySearchFiltersSchema = z
	.object({
		classifications: z.array(SessionClassificationSchema).optional(),
		hall: nonEmptyStringSchema.optional(),
		memoryTypes: z.array(MemoryTypeSchema).optional(),
		recency: nonEmptyStringSchema.optional(),
		room: nonEmptyStringSchema.optional(),
		sourceId: nonEmptyStringSchema.optional(),
		wing: nonEmptyStringSchema.optional(),
	})
	.strict();
export type MemorySearchFilters = z.infer<typeof MemorySearchFiltersSchema>;

export const MemorySearchQuerySchema = z
	.object({
		filters: MemorySearchFiltersSchema.optional(),
		limit: z.number().int().positive().optional(),
		query: nonEmptyStringSchema,
		tokenBudget: z.number().int().positive().optional(),
	})
	.strict();
export type MemorySearchQuery = z.infer<typeof MemorySearchQuerySchema>;

export const MemorySearchResultSchema = z
	.object({
		artifactId: nonEmptyStringSchema,
		classification: SessionClassificationSchema,
		hall: nonEmptyStringSchema.optional(),
		memoryType: MemoryTypeSchema.optional(),
		retrievalReason: nonEmptyStringSchema.optional(),
		room: nonEmptyStringSchema.optional(),
		score: z.number().finite(),
		snippet: nonEmptyStringSchema,
		source: nonEmptyStringSchema,
		sourcePath: nonEmptyStringSchema,
		sourceType: nonEmptyStringSchema,
		updatedAt: isoDatetimeStringSchema,
		wing: nonEmptyStringSchema.optional(),
	})
	.strict();
export type MemorySearchResult = z.infer<typeof MemorySearchResultSchema>;

export const MemoryArtifactSchema = z
	.object({
		agentId: nonEmptyStringSchema.optional(),
		artifactId: nonEmptyStringSchema,
		classification: SessionClassificationSchema,
		content: z.string(),
		hall: nonEmptyStringSchema.optional(),
		memoryType: MemoryTypeSchema.optional(),
		room: nonEmptyStringSchema.optional(),
		sessionId: nonEmptyStringSchema.optional(),
		source: nonEmptyStringSchema,
		sourcePath: nonEmptyStringSchema,
		sourceType: nonEmptyStringSchema,
		title: nonEmptyStringSchema.optional(),
		updatedAt: isoDatetimeStringSchema,
		wing: nonEmptyStringSchema.optional(),
	})
	.strict();
export type MemoryArtifact = z.infer<typeof MemoryArtifactSchema>;

export const MemoryStatusSchema = z
	.object({
		activeMemoryCompatible: z.boolean(),
		cache: MemoryStatusCacheSchema,
		contextEngineCompatible: z.boolean(),
		diagnostics: MemoryStatusDiagnosticsSchema,
		ingestionLagSeconds: z.number().nonnegative(),
		memoryCount: z.number().int().nonnegative(),
		runtime: RuntimeHealthSchema,
		sources: z.array(SourceStatusSchema),
	})
	.strict();
export type MemoryStatus = z.infer<typeof MemoryStatusSchema>;

export const MemoryPromoteInputSchema = z
	.object({
		agentId: nonEmptyStringSchema.optional(),
		artifactId: nonEmptyStringSchema.optional(),
		classification: SessionClassificationSchema,
		content: z.string().optional(),
		memoryType: MemoryTypeSchema,
		metadata: z.record(z.string(), JsonValueSchema).optional(),
		sessionId: nonEmptyStringSchema.optional(),
		source: nonEmptyStringSchema,
		sourcePath: nonEmptyStringSchema.optional(),
	})
	.strict()
	.superRefine((value, context) => {
		if (!value.artifactId && value.content === undefined) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Expected either artifactId or content.',
				path: ['artifactId'],
			});
		}
	});
export type MemoryPromoteInput = z.infer<typeof MemoryPromoteInputSchema>;

export const MemoryIndexRequestSchema = z
	.object({
		force: z.boolean().optional(),
		reason: RuntimeRefreshReasonSchema,
		sourceId: nonEmptyStringSchema.optional(),
		target: nonEmptyStringSchema.optional(),
	})
	.strict();
export type MemoryIndexRequest = z.infer<typeof MemoryIndexRequestSchema>;

export const SyncJobSchema = z
	.object({
		errorMessage: nonEmptyStringSchema.optional(),
		finishedAt: isoDatetimeStringSchema.optional(),
		jobId: nonEmptyStringSchema,
		sourceId: nonEmptyStringSchema,
		startedAt: isoDatetimeStringSchema,
		status: JobStatusSchema,
	})
	.strict();
export type SyncJob = z.infer<typeof SyncJobSchema>;

export const HookEnvelopeSchema = z
	.object({
		agentId: nonEmptyStringSchema,
		event: nonEmptyStringSchema,
		idempotencyKey: nonEmptyStringSchema,
		payload: JsonValueSchema,
		sessionId: nonEmptyStringSchema,
		timestamp: isoDatetimeStringSchema,
		version: HookEnvelopeVersionSchema,
	})
	.strict();
export type HookEnvelope = z.infer<typeof HookEnvelopeSchema>;

export const ContextInjectionEntrySchema = z
	.object({
		artifactId: nonEmptyStringSchema,
		classification: SessionClassificationSchema,
		content: z.string(),
		recency: nonEmptyStringSchema,
		score: z.number().finite().optional(),
		source: nonEmptyStringSchema,
		sourcePath: nonEmptyStringSchema,
		sourceType: nonEmptyStringSchema,
		updatedAt: isoDatetimeStringSchema,
	})
	.strict();
export type ContextInjectionEntry = z.infer<typeof ContextInjectionEntrySchema>;

export type JsonMetadata = Record<string, JsonValue>;
