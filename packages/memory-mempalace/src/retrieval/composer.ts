import {
	createFingerprint,
	type MemorySearchQuery,
	MemorySearchQuerySchema,
	type MemorySearchResult,
	parseWithSchema,
} from '@mempalace-openclaw/shared';

import {
	computeRankedScore,
	DEFAULT_RANKING_PROFILE,
	type RankingProfile,
} from './ranking.js';

export type MemorySearchComposerDiagnostics = {
	duplicateResultsCollapsed: number;
	keywordFallbackApplied: boolean;
	rankingProfile: RankingProfile;
};

export type MemorySearchComposition = {
	diagnostics: MemorySearchComposerDiagnostics;
	results: MemorySearchResult[];
};

function approximateTokenCount(results: MemorySearchResult[]): number {
	return results.reduce((total, result) => {
		const chars = result.snippet.length;
		return total + Math.ceil(chars / 4);
	}, 0);
}

function applyKeywordFallback(
	query: MemorySearchQuery,
	results: MemorySearchResult[],
): { applied: boolean; results: MemorySearchResult[] } {
	const normalizedQuery = query.query.toLowerCase();
	const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
	if (tokens.length === 0) {
		return { applied: false, results };
	}

	const strongestScore = results[0]?.score ?? 0;
	if (results.length > 0 && strongestScore >= 0.3) {
		return { applied: false, results };
	}

	const fallback = results
		.filter((result) =>
			tokens.some((token) =>
				[result.snippet, result.source, result.sourcePath]
					.join(' ')
					.toLowerCase()
					.includes(token),
			),
		)
		.sort((left, right) => right.score - left.score);

	if (fallback.length === 0) {
		return { applied: false, results };
	}

	return {
		applied: true,
		results: fallback,
	};
}

export function composeMemorySearchResults(
	queryInput: MemorySearchQuery,
	rawResults: MemorySearchResult[],
	options: {
		agentId?: string;
		pinnedMemory?: boolean;
		rankingProfile?: RankingProfile;
	} = {},
): MemorySearchComposition {
	const query = parseWithSchema(
		MemorySearchQuerySchema,
		queryInput,
		'Invalid memory search query.',
	);
	const rankingProfile = options.rankingProfile ?? DEFAULT_RANKING_PROFILE;

	const byArtifactId = new Map<string, MemorySearchResult>();
	let artifactCollapses = 0;
	for (const rawResult of rawResults) {
		const result: MemorySearchResult = {
			...rawResult,
			score: computeRankedScore(query, rawResult, {
				...(options.agentId ? { agentId: options.agentId } : {}),
				...(options.pinnedMemory !== undefined
					? { pinnedMemory: options.pinnedMemory }
					: {}),
				profile: rankingProfile,
			}),
		};

		const currentArtifact = byArtifactId.get(result.artifactId);
		if (currentArtifact) {
			artifactCollapses += 1;
		}
		if (!currentArtifact || currentArtifact.score < result.score) {
			byArtifactId.set(result.artifactId, result);
		}
	}

	const bySnippetFingerprint = new Map<string, MemorySearchResult>();
	let snippetCollapses = 0;
	for (const result of byArtifactId.values()) {
		const fingerprint = createFingerprint({
			snippet: result.snippet,
			sourcePath: result.sourcePath,
		});
		const currentSnippet = bySnippetFingerprint.get(fingerprint);
		if (currentSnippet) {
			snippetCollapses += 1;
		}
		if (!currentSnippet || currentSnippet.score < result.score) {
			bySnippetFingerprint.set(fingerprint, result);
		}
	}

	const ordered = [...bySnippetFingerprint.values()].sort(
		(left, right) => right.score - left.score,
	);
	const limit = query.limit ?? ordered.length;
	const tokenBudget = query.tokenBudget;
	const limitedResults: MemorySearchResult[] = [];

	for (const result of ordered) {
		const nextResults = [...limitedResults, result];
		if (
			tokenBudget !== undefined &&
			approximateTokenCount(nextResults) > tokenBudget
		) {
			break;
		}
		limitedResults.push(result);
		if (limitedResults.length >= limit) {
			break;
		}
	}

	const fallback = applyKeywordFallback(query, limitedResults);
	return {
		diagnostics: {
			duplicateResultsCollapsed: artifactCollapses + snippetCollapses,
			keywordFallbackApplied: fallback.applied,
			rankingProfile,
		},
		results: fallback.results,
	};
}
