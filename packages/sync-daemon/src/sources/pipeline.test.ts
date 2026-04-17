import { describe, expect, it } from 'vitest';

import {
	buildKnowledgeGraphUpsertInput,
	buildPromoteInput,
	prepareSourceChunks,
} from './pipeline.js';

describe('stage 7 source pipeline classification', () => {
	it('prefers explicit source.mode over content heuristics', () => {
		const [chunk] = prepareSourceChunks({
			content: 'Decision: this text looks like a decision.',
			logicalPath: 'repo-main:README.md',
			relativePath: 'README.md',
			source: {
				id: 'repo-main',
				kind: 'git',
				mode: 'repo',
				path: '/repo',
			},
		});

		expect(chunk?.classification).toBe('artifact');
		expect(chunk?.classificationConfidence).toBe('high');
		expect(chunk?.classificationReason).toBe('source.mode:repo');
	});

	it('uses content markers when mode is absent', () => {
		const [chunk] = prepareSourceChunks({
			content: 'Milestone: release candidate is now live.',
			logicalPath: 'notes:ship.md',
			relativePath: 'ship.md',
			source: {
				id: 'notes',
				kind: 'filesystem',
				path: '/notes',
			},
		});

		expect(chunk?.classification).toBe('milestone');
		expect(chunk?.classificationReason).toBe('content-marker:milestone');
	});

	it('falls back to path signals and carries metadata to promote input', () => {
		const [chunk] = prepareSourceChunks({
			content: 'General session transcript.',
			logicalPath: 'sessions:alpha.md',
			relativePath: 'sessions/alpha.md',
			source: {
				defaults: {
					hall: 'hall-alpha',
					wing: 'wing-main',
				},
				id: 'sessions',
				kind: 'filesystem',
				path: '/sessions',
			},
		});

		expect(chunk?.classification).toBe('conversation');
		expect(chunk?.classificationConfidence).toBe('medium');
		expect(chunk?.classificationReason).toBe('path-signal:sessions');
		expect(chunk).toBeDefined();

		const promoteInput = buildPromoteInput(chunk as NonNullable<typeof chunk>, {
			defaults: {
				hall: 'hall-alpha',
				wing: 'wing-main',
			},
			id: 'sessions',
			kind: 'filesystem',
			path: '/sessions',
		});

		expect(promoteInput.metadata).toMatchObject({
			classificationConfidence: 'medium',
			classificationReason: 'path-signal:sessions',
			defaultsHall: 'hall-alpha',
			defaultsWing: 'wing-main',
		});
	});

	it('extracts a deterministic knowledge graph input from explicit markers', () => {
		const [chunk] = prepareSourceChunks({
			content:
				'# Gateway\n\nowner: QA\n\ndepends-on: MemPalace\n\nvalidFrom: 2026-04-01T00:00:00Z',
			logicalPath: 'docs:gateway.md',
			relativePath: 'docs/gateway.md',
			source: {
				id: 'docs-main',
				kind: 'documents',
				path: '/docs',
			},
		});

		expect(chunk).toBeDefined();
		const kgInput = buildKnowledgeGraphUpsertInput({
			artifactId: 'artifact-gateway',
			chunk: chunk as NonNullable<typeof chunk>,
		});

		expect(kgInput).not.toBeNull();
		expect(kgInput?.entities.length).toBeGreaterThan(0);
		expect(kgInput?.relations.length).toBeGreaterThan(0);
	});
});
