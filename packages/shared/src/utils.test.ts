import { describe, expect, it } from 'vitest';

import {
	createFingerprint,
	createProvenance,
	createVersionedHookEnvelope,
	stableStringify,
} from './index.js';

describe('shared utilities', () => {
	it('produces deterministic fingerprints for semantically equal objects', () => {
		const left = {
			a: 1,
			b: {
				x: true,
				y: ['alpha', 'beta'],
			},
		};
		const right = {
			a: 1,
			b: {
				x: true,
				y: ['alpha', 'beta'],
			},
		};

		expect(stableStringify(left)).toBe(stableStringify(right));
		expect(createFingerprint(left)).toBe(createFingerprint(right));
	});

	it('creates versioned hook envelopes with a fixed v1 version', () => {
		expect(
			createVersionedHookEnvelope({
				agentId: 'agent-main',
				event: 'milestone',
				idempotencyKey: 'evt_123',
				payload: { note: 'hello' },
				sessionId: 'sess_123',
				timestamp: '2026-04-15T12:00:00Z',
			}),
		).toMatchObject({
			version: 'v1',
		});
	});

	it('creates provenance with the required minimum fields', () => {
		expect(
			createProvenance({
				classification: 'decision',
				source: 'project-notes',
				sourcePath: '/vault/project.md',
				sourceType: 'filesystem',
				updatedAt: '2026-04-15T12:00:00Z',
			}),
		).toMatchObject({
			classification: 'decision',
			source: 'project-notes',
		});
	});
});
