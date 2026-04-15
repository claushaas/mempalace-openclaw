import {
	createFingerprint,
	type MemorySearchQuery,
	MemorySearchQuerySchema,
	type MemorySearchResult,
	parseWithSchema,
} from '@mempalace-openclaw/shared';

function computeRecencyBoost(updatedAt: string): number {
	const ageMs = Date.now() - Date.parse(updatedAt);

	if (!Number.isFinite(ageMs) || ageMs <= 0) {
		return 0.15;
	}

	const ageDays = ageMs / (1000 * 60 * 60 * 24);
	if (ageDays <= 1) {
		return 0.15;
	}
	if (ageDays <= 7) {
		return 0.1;
	}
	if (ageDays <= 30) {
		return 0.05;
	}
	return 0;
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
		boost += 0.08;
	}
	if (filters.hall && result.hall === filters.hall) {
		boost += 0.08;
	}
	if (filters.room && result.room === filters.room) {
		boost += 0.08;
	}
	if (filters.sourceId && result.source === filters.sourceId) {
		boost += 0.08;
	}
	if (filters.classifications?.includes(result.classification)) {
		boost += 0.05;
	}
	if (filters.memoryTypes?.includes(result.memoryType ?? 'facts')) {
		boost += 0.05;
	}

	return boost;
}

function computeKeywordBoost(
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
	return matches / tokens.length / 5;
}

function approximateTokenCount(results: MemorySearchResult[]): number {
	return results.reduce((total, result) => {
		const chars = result.snippet.length;
		return total + Math.ceil(chars / 4);
	}, 0);
}

export function composeMemorySearchResults(
	queryInput: MemorySearchQuery,
	rawResults: MemorySearchResult[],
): MemorySearchResult[] {
	const query = parseWithSchema(
		MemorySearchQuerySchema,
		queryInput,
		'Invalid memory search query.',
	);

	const byArtifactId = new Map<string, MemorySearchResult>();
	const bySnippetFingerprint = new Map<string, MemorySearchResult>();

	for (const rawResult of rawResults) {
		const rankedScore =
			rawResult.score +
			computeRecencyBoost(rawResult.updatedAt) +
			computeStructuralBoost(query, rawResult) +
			computeKeywordBoost(query, rawResult);
		const result: MemorySearchResult = {
			...rawResult,
			score: rankedScore,
		};

		const currentArtifact = byArtifactId.get(result.artifactId);
		if (!currentArtifact || currentArtifact.score < result.score) {
			byArtifactId.set(result.artifactId, result);
		}
	}

	for (const result of byArtifactId.values()) {
		const fingerprint = createFingerprint({
			snippet: result.snippet,
			sourcePath: result.sourcePath,
		});
		const currentSnippet = bySnippetFingerprint.get(fingerprint);
		if (!currentSnippet || currentSnippet.score < result.score) {
			bySnippetFingerprint.set(fingerprint, result);
		}
	}

	const ordered = [...bySnippetFingerprint.values()].sort(
		(left, right) => right.score - left.score,
	);
	const limit = query.limit ?? ordered.length;
	const tokenBudget = query.tokenBudget;

	if (!tokenBudget) {
		return ordered.slice(0, limit);
	}

	const output: MemorySearchResult[] = [];
	for (const result of ordered) {
		const nextResults = [...output, result];
		if (approximateTokenCount(nextResults) > tokenBudget) {
			break;
		}
		output.push(result);
		if (output.length >= limit) {
			break;
		}
	}

	return output;
}

export function applyKeywordFallback(
	query: MemorySearchQuery,
	results: MemorySearchResult[],
): MemorySearchResult[] {
	const normalizedQuery = query.query.toLowerCase();
	const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
	if (tokens.length === 0) {
		return results;
	}

	const strongestScore = results[0]?.score ?? 0;
	if (results.length > 0 && strongestScore >= 0.3) {
		return results;
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

	return fallback.length > 0 ? fallback : results;
}
