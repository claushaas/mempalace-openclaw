import type {
	MemoryArtifact,
	MemoryIndexRequest,
	MemoryPromoteInput,
	MemorySearchQuery,
	MemorySearchResult,
	MemPalaceClient,
	RuntimeHealth,
	SourceStatus,
} from '@mempalace-openclaw/shared';
import { describe, expect, it, vi } from 'vitest';

import { MemoryRuntimeService } from './service.js';

function createFakeClient(): MemPalaceClient {
	const artifacts = new Map<string, MemoryArtifact>([
		[
			'artifact-decision',
			{
				artifactId: 'artifact-decision',
				classification: 'decision',
				content: 'Use MCP as the backend seam for the runtime.',
				source: 'repo-main',
				sourcePath: '/repo/decision.md',
				sourceType: 'filesystem',
				updatedAt: '2026-04-15T12:00:00Z',
			},
		],
	]);

	const results: MemorySearchResult[] = [
		{
			artifactId: 'artifact-decision',
			classification: 'decision',
			score: 0.2,
			snippet: 'Use MCP as the backend seam for the runtime.',
			source: 'repo-main',
			sourcePath: '/repo/decision.md',
			sourceType: 'filesystem',
			updatedAt: '2026-04-15T12:00:00Z',
		},
	];

	const health: RuntimeHealth = {
		backendReachable: true,
		status: 'ready',
	};
	const sources: SourceStatus[] = [
		{
			enabled: true,
			kind: 'filesystem',
			lastSyncedAt: '2026-04-15T12:00:00Z',
			path: '/repo',
			sourceId: 'repo-main',
		},
	];

	return {
		get: vi.fn(async (artifactId: string) => {
			const artifact = artifacts.get(artifactId);
			if (!artifact) {
				throw new Error(`Missing artifact in fake client: ${artifactId}`);
			}
			return artifact;
		}),
		getHealth: vi.fn(async () => health),
		listSourcesStatus: vi.fn(async () => sources),
		promote: vi.fn(async (input: MemoryPromoteInput) => {
			const artifact: MemoryArtifact = {
				artifactId: input.artifactId ?? 'artifact-promoted',
				classification: input.classification,
				content: input.content ?? 'promoted content',
				source: input.source,
				sourcePath: input.sourcePath ?? '/promoted',
				sourceType: 'manual',
				updatedAt: '2026-04-15T12:00:00Z',
			};
			artifacts.set(artifact.artifactId, artifact);
			return artifact;
		}),
		refreshIndex: vi.fn(async (request: MemoryIndexRequest) => ({
			accepted: true as const,
			reason: request.reason,
		})),
		search: vi.fn(async (_query: MemorySearchQuery) => results),
	};
}

describe('MemoryRuntimeService', () => {
	it('searches, gets, reports status, indexes and promotes', async () => {
		const client = createFakeClient();
		const service = new MemoryRuntimeService(client);

		const searchResults = await service.search({
			query: 'backend seam',
		});
		expect(searchResults[0]?.artifactId).toBe('artifact-decision');

		const artifact = await service.get('artifact-decision');
		expect(artifact.content).toContain('Use MCP');

		const status = await service.status();
		expect(status.runtime.status).toBe('ready');
		expect(status.contextEngineCompatible).toBe(true);
		expect(status.activeMemoryCompatible).toBe(true);
		expect(status.cache.artifactEntries).toBeGreaterThanOrEqual(1);
		expect(status.cache.metadataEntries).toBeGreaterThanOrEqual(1);
		expect(status.cache.stale).toBe(false);
		expect(status.diagnostics.rankingProfile).toBe('v2');

		await expect(
			service.index({
				reason: 'manual-reindex',
			}),
		).resolves.toBeUndefined();
		const staleStatus = await service.status();
		expect(staleStatus.cache.stale).toBe(true);
		expect(staleStatus.cache.lastRefreshReason).toBe('manual-reindex');

		const promoted = await service.promote({
			classification: 'artifact',
			content: 'new memory',
			memoryType: 'discoveries',
			source: 'manual',
		});
		expect(promoted.content).toBe('new memory');
		const refreshedStatus = await service.status();
		expect(refreshedStatus.cache.stale).toBe(false);
	});
});
