import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
	AgentDiaryAppendInputSchema,
	AgentDiaryEntrySchema,
	AgentDiaryQuerySchema,
	HookEnvelopeSchema,
	KnowledgeGraphExpansionResultSchema,
	KnowledgeGraphUpsertInputSchema,
	MemoryArtifactSchema,
	MemoryIndexRequestSchema,
	MemoryPromoteInputSchema,
	MemorySearchQuerySchema,
	MemorySearchResultSchema,
	MemoryStatusSchema,
	RuntimeHealthSchema,
	SourceConfigSchema,
} from './index.js';

function readExample(fileName: string): unknown {
	const fileUrl = new URL(`../../../examples/${fileName}`, import.meta.url);
	return JSON.parse(readFileSync(fileUrl, 'utf8'));
}

describe('contract schemas', () => {
	it('parses the published source examples', () => {
		expect(
			SourceConfigSchema.parse(readExample('obsidian-source.json')),
		).toMatchObject({
			id: 'obsidian-main',
			kind: 'filesystem',
		});
		expect(
			SourceConfigSchema.parse(readExample('repo-source.json')),
		).toMatchObject({
			id: 'repo-main',
			kind: 'git',
		});
	});

	it('rejects SourceConfig without required base fields', () => {
		expect(() =>
			SourceConfigSchema.parse({ id: 'missing-kind', path: '/tmp' }),
		).toThrow();
		expect(() =>
			SourceConfigSchema.parse({ id: 'missing-path', kind: 'filesystem' }),
		).toThrow();
		expect(() =>
			SourceConfigSchema.parse({ kind: 'filesystem', path: '/tmp' }),
		).toThrow();
	});

	it('requires hook version v1 and an idempotency key', () => {
		expect(
			HookEnvelopeSchema.parse({
				agentId: 'agent-main',
				event: 'milestone',
				idempotencyKey: 'evt_123',
				payload: { ok: true },
				sessionId: 'sess_123',
				timestamp: '2026-04-15T12:00:00Z',
				version: 'v1',
			}),
		).toMatchObject({ version: 'v1' });

		expect(() =>
			HookEnvelopeSchema.parse({
				agentId: 'agent-main',
				event: 'milestone',
				payload: { ok: true },
				sessionId: 'sess_123',
				timestamp: '2026-04-15T12:00:00Z',
				version: 'v2',
			}),
		).toThrow();
	});

	it('rejects MemoryPromoteInput when both artifactId and content are absent', () => {
		expect(() =>
			MemoryPromoteInputSchema.parse({
				classification: 'decision',
				memoryType: 'facts',
				source: 'project-notes',
			}),
		).toThrow();
	});

	it('requires a reason for MemoryIndexRequest', () => {
		expect(() =>
			MemoryIndexRequestSchema.parse({ target: 'runtime' }),
		).toThrow();
	});

	it('accepts query and structural filters in MemorySearchQuery', () => {
		expect(
			MemorySearchQuerySchema.parse({
				filters: {
					classifications: ['decision'],
					hall: 'hall_discoveries',
					memoryTypes: ['facts'],
					room: 'room_release',
					sourceId: 'repo-main',
					wing: 'wing_projects',
				},
				limit: 5,
				query: 'release plan',
				tokenBudget: 400,
			}),
		).toMatchObject({ query: 'release plan' });
	});

	it('requires minimum provenance in MemorySearchResult and MemoryArtifact', () => {
		expect(() =>
			MemorySearchResultSchema.parse({
				artifactId: 'art_1',
				score: 0.9,
				snippet: 'Important detail',
			}),
		).toThrow();

		expect(() =>
			MemoryArtifactSchema.parse({
				artifactId: 'art_1',
				content: 'full content',
			}),
		).toThrow();
	});

	it('differentiates runtime health statuses without backend implementation', () => {
		expect(
			RuntimeHealthSchema.parse({
				backendReachable: true,
				status: 'ready',
			}),
		).toMatchObject({ status: 'ready' });
		expect(
			RuntimeHealthSchema.parse({
				backendReachable: false,
				message: 'Backend degraded',
				status: 'degraded',
			}),
		).toMatchObject({ status: 'degraded' });
		expect(
			RuntimeHealthSchema.parse({
				backendReachable: false,
				status: 'unavailable',
			}),
		).toMatchObject({ status: 'unavailable' });
	});

	it('extends memory status with observable cache and diagnostics state', () => {
		expect(
			MemoryStatusSchema.parse({
				activeMemoryCompatible: true,
				cache: {
					artifactEntries: 2,
					lastRefreshReason: 'cache-refresh',
					metadataEntries: 1,
					stale: false,
				},
				contextEngineCompatible: true,
				diagnostics: {
					advancedCapabilities: {
						agentDiaries: 'enabled',
						knowledgeGraph: 'unavailable',
						pinnedMemory: 'enabled',
						queryExpansion: 'disabled',
					},
					cacheEvictions: 1,
					contextCompactions: 2,
					duplicateResultsCollapsed: 3,
					keywordFallbackApplied: false,
					rankingProfile: 'v2',
				},
				ingestionLagSeconds: 12,
				memoryCount: 4,
				runtime: {
					backendReachable: true,
					status: 'ready',
				},
				sources: [],
			}),
		).toMatchObject({
			cache: {
				artifactEntries: 2,
			},
			diagnostics: {
				advancedCapabilities: {
					agentDiaries: 'enabled',
					knowledgeGraph: 'unavailable',
					pinnedMemory: 'enabled',
					queryExpansion: 'disabled',
				},
				cacheEvictions: 1,
				contextCompactions: 2,
				rankingProfile: 'v2',
			},
		});
	});

	it('parses optional knowledge graph payloads', () => {
		expect(
			KnowledgeGraphUpsertInputSchema.parse({
				entities: [
					{
						entityId: 'decision:mcp',
						entityType: 'decision',
						name: 'MCP backend seam',
						sourceArtifactId: 'artifact-decision',
					},
				],
				relations: [
					{
						relationType: 'uses',
						sourceArtifactId: 'artifact-decision',
						sourceEntityId: 'decision:mcp',
						targetEntityId: 'concept:mcp',
					},
				],
			}),
		).toMatchObject({
			entities: expect.any(Array),
			relations: expect.any(Array),
		});
		expect(
			KnowledgeGraphExpansionResultSchema.parse({
				expandedTerms: ['mcp', 'backend seam'],
				reason: 'graph-neighbors',
			}).expandedTerms,
		).toEqual(['mcp', 'backend seam']);
	});

	it('parses optional diary payloads', () => {
		expect(
			AgentDiaryAppendInputSchema.parse({
				agentId: 'main',
				content: 'Short diary note.',
				metadata: {
					recordKind: 'agent-diary',
				},
				sessionId: 'session-1',
			}),
		).toMatchObject({
			agentId: 'main',
		});
		expect(
			AgentDiaryEntrySchema.parse({
				agentId: 'main',
				content: 'Short diary note.',
				entryId: 'entry-1',
				source: 'agent-diary:main',
				sourcePath: '/diaries/main/2026/04/16/entry-1.json',
				updatedAt: '2026-04-16T12:00:00Z',
			}).entryId,
		).toBe('entry-1');
		expect(
			AgentDiaryQuerySchema.parse({
				agentId: 'main',
				limit: 5,
			}).limit,
		).toBe(5);
	});
});
