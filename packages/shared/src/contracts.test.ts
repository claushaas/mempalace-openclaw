import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
	HookEnvelopeSchema,
	MemoryArtifactSchema,
	MemoryIndexRequestSchema,
	MemoryPromoteInputSchema,
	MemorySearchQuerySchema,
	MemorySearchResultSchema,
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
});
