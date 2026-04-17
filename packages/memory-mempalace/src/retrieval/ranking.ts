import type {
	MemorySearchQuery,
	MemorySearchResult,
	SessionClassification,
} from '@mempalace-openclaw/shared';

export const DEFAULT_RANKING_PROFILE = 'v2';
export type RankingProfile = 'v2' | 'v3';

const CLASSIFICATION_PRIORITY_BOOST: Record<SessionClassification, number> = {
	artifact: 0.02,
	conversation: 0.01,
	decision: 0.06,
	milestone: 0.04,
	problem: 0.05,
};

const PINNED_MEMORY_WEIGHT = {
	agent: 0.14,
	global: 0.18,
} as const;

function computeRecencyBoost(updatedAt: string): number {
	const ageMs = Date.now() - Date.parse(updatedAt);

	if (!Number.isFinite(ageMs) || ageMs <= 0) {
		return 0.12;
	}

	const ageDays = ageMs / (1000 * 60 * 60 * 24);
	if (ageDays <= 1) {
		return 0.12;
	}
	if (ageDays <= 7) {
		return 0.08;
	}
	if (ageDays <= 30) {
		return 0.04;
	}
	return 0;
}

function computeSourceConfidenceBoost(sourceType: string): number {
	const normalized = sourceType.toLowerCase();
	if (
		normalized === 'filesystem' ||
		normalized === 'git' ||
		normalized === 'documents'
	) {
		return 0.08;
	}
	if (
		normalized === 'sessions' ||
		normalized === 'spool' ||
		normalized === 'manual'
	) {
		return 0.04;
	}
	return 0.02;
}

function computeStructuralBoost(
	query: MemorySearchQuery,
	result: MemorySearchResult,
): number {
	const filters = query.filters;
	if (!filters) {
		return 0;
	}

	let boost = 0;
	if (filters.wing && result.wing === filters.wing) {
		boost += 0.05;
	}
	if (filters.hall && result.hall === filters.hall) {
		boost += 0.05;
	}
	if (filters.room && result.room === filters.room) {
		boost += 0.05;
	}
	if (filters.sourceId && result.source === filters.sourceId) {
		boost += 0.05;
	}
	if (filters.classifications?.includes(result.classification)) {
		boost += 0.03;
	}
	if (filters.memoryTypes?.includes(result.memoryType ?? 'facts')) {
		boost += 0.03;
	}

	return boost;
}

export function computeKeywordBoost(
	query: MemorySearchQuery,
	result: MemorySearchResult,
): number {
	const tokens = query.query
		.toLowerCase()
		.split(/\s+/)
		.map((token) => token.trim())
		.filter(Boolean);

	if (tokens.length === 0) {
		return 0;
	}

	const haystack = [
		result.snippet,
		result.source,
		result.sourcePath,
		result.retrievalReason ?? '',
	]
		.join(' ')
		.toLowerCase();

	const matches = tokens.filter((token) => haystack.includes(token)).length;
	return matches === 0 ? 0 : matches / tokens.length / 5;
}

function computePinnedMemoryBoost(
	result: MemorySearchResult,
	options: {
		agentId?: string;
		enabled?: boolean;
		profile: RankingProfile;
	},
): number {
	if (!options.enabled || options.profile !== 'v3') {
		return 0;
	}

	if (result.metadata?.pinned !== true) {
		return 0;
	}

	const pinScope = result.metadata.pinScope === 'agent' ? 'agent' : 'global';
	if (pinScope === 'agent') {
		const pinnedAgentId =
			typeof result.metadata.pinnedAgentId === 'string'
				? result.metadata.pinnedAgentId
				: undefined;
		if (pinnedAgentId && options.agentId && pinnedAgentId !== options.agentId) {
			return 0;
		}
		return PINNED_MEMORY_WEIGHT.agent;
	}

	return PINNED_MEMORY_WEIGHT.global;
}

export function computeRankedScore(
	query: MemorySearchQuery,
	result: MemorySearchResult,
	options: {
		agentId?: string;
		pinnedMemory?: boolean;
		profile?: RankingProfile;
	} = {},
): number {
	const profile = options.profile ?? DEFAULT_RANKING_PROFILE;
	return (
		result.score +
		computeRecencyBoost(result.updatedAt) +
		computeSourceConfidenceBoost(result.sourceType) +
		computeStructuralBoost(query, result) +
		CLASSIFICATION_PRIORITY_BOOST[result.classification] +
		computeKeywordBoost(query, result) +
		computePinnedMemoryBoost(result, {
			...(options.agentId ? { agentId: options.agentId } : {}),
			...(options.pinnedMemory !== undefined
				? { enabled: options.pinnedMemory }
				: {}),
			profile,
		})
	);
}
