import type { MemorySearchResult } from '@mempalace-openclaw/shared';
import { describe, expect, it } from 'vitest';

import {
	applyKeywordFallback,
	composeMemorySearchResults,
} from './composer.js';

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
		const results = composeMemorySearchResults(
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

		expect(results).toHaveLength(2);
		expect(results[0]?.artifactId).toBe('artifact-1');
	});

	it('applies keyword fallback when scores are weak', () => {
		const results = applyKeywordFallback(
			{
				query: 'gateway memory',
			},
			baseResults,
		);

		expect(results[0]?.artifactId).toBe('artifact-2');
	});
});
