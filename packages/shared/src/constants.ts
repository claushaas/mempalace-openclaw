export const MEMORY_TYPE_VALUES = [
	'facts',
	'events',
	'discoveries',
	'preferences',
	'advice',
] as const;

export const SESSION_CLASSIFICATION_VALUES = [
	'decision',
	'problem',
	'milestone',
	'artifact',
	'conversation',
] as const;

export const SOURCE_KIND_VALUES = [
	'filesystem',
	'git',
	'chat-export',
	'documents',
	'spool',
] as const;

export const JOB_STATUS_VALUES = [
	'pending',
	'running',
	'completed',
	'failed',
] as const;

export const RUNTIME_REFRESH_REASON_VALUES = [
	'post-ingest',
	'scheduled-sync',
	'manual-reindex',
	'checkpoint-refresh',
	'cache-refresh',
] as const;

export const RUNTIME_HEALTH_STATUS_VALUES = [
	'ready',
	'degraded',
	'unavailable',
] as const;

export const HOOK_ENVELOPE_VERSION_VALUES = ['v1'] as const;
