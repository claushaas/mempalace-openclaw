import type { MemorySearchResult } from '@mempalace-openclaw/shared';
import { describe, expect, it } from 'vitest';

import { composeMemorySearchResults } from './composer.js';
import { computeRankedScore } from './ranking.js';

const baseResults: MemorySearchResult[] = [
	{
		artifactId: 'artifact-1',
		classification: 'decision',
		score: 0.2,
		snippet: 'Use MCP as the backend seam for memory runtime.',
		source: 'repo-main',
		sourcePath: '/repo/decision.md',
		sourceType: 'filesystem',
		updatedAt: '2026-04-15T12:00:00Z',
	},
	{
		artifactId: 'artifact-1',
		classification: 'decision',
		score: 0.1,
		snippet: 'Use MCP as the backend seam for memory runtime.',
		source: 'repo-main',
		sourcePath: '/repo/decision.md',
		sourceType: 'filesystem',
		updatedAt: '2026-04-10T12:00:00Z',
	},
	{
		artifactId: 'artifact-2',
		classification: 'conversation',
		score: 0.25,
		snippet: 'Previous discussion about the gateway memory slot.',
		source: 'session-log',
		sourcePath: '/sessions/alpha.md',
		sourceType: 'sessions',
		updatedAt: '2026-04-14T12:00:00Z',
	},
];

describe('retrieval composer', () => {
	it('deduplicates and ranks results', () => {
		const composition = composeMemorySearchResults(
			{
				filters: {
					classifications: ['decision'],
				},
				limit: 5,
				query: 'backend seam',
				tokenBudget: 800,
			},
			baseResults,
		);

		expect(composition.results).toHaveLength(2);
		expect(composition.results[0]?.artifactId).toBe('artifact-1');
		expect(composition.diagnostics.duplicateResultsCollapsed).toBeGreaterThan(
			0,
		);
		expect(composition.diagnostics.rankingProfile).toBe('v2');
	});

	it('applies keyword fallback when scores are weak', () => {
		const weakResults: MemorySearchResult[] = [
			{
				artifactId: 'artifact-weak',
				classification: 'conversation',
				score: 0.01,
				snippet: 'Gateway memory notes from a very old session.',
				source: 'session-log',
				sourcePath: '/sessions/old.md',
				sourceType: 'sessions',
				updatedAt: '2024-01-01T00:00:00Z',
			},
		];
		const composition = composeMemorySearchResults(
			{
				query: 'gateway memory',
			},
			weakResults,
		);

		expect(composition.results[0]?.artifactId).toBe('artifact-weak');
		expect(composition.diagnostics.keywordFallbackApplied).toBe(true);
	});

	it('computes a stronger ranked score for structural and trusted matches', () => {
		const decisionResult = baseResults[0];
		const conversationResult = baseResults[2];
		expect(decisionResult).toBeDefined();
		expect(conversationResult).toBeDefined();

		const decisionScore = computeRankedScore(
			{
				filters: {
					classifications: ['decision'],
					sourceId: 'repo-main',
				},
				query: 'backend seam',
			},
			decisionResult as MemorySearchResult,
		);
		const conversationScore = computeRankedScore(
			{
				query: 'backend seam',
			},
			conversationResult as MemorySearchResult,
		);

		expect(decisionScore).toBeGreaterThan(conversationScore);
	});
});
