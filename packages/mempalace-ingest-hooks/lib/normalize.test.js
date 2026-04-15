import { describe, expect, it } from 'vitest';

import { normalizeSpoolRecordToPromoteInput } from './normalize.js';

describe('normalizeSpoolRecordToPromoteInput', () => {
	it('normalizes command flush records into conversational promotes', () => {
		const input = normalizeSpoolRecordToPromoteInput({
			envelope: {
				agentId: 'agent-main',
				event: 'command:new',
				idempotencyKey: 'idem-1',
				payload: {
					workspaceDir: '/repo',
				},
				sessionId: 'session-1',
				timestamp: '2026-04-15T12:00:00Z',
				version: 'v1',
			},
			hookSource: 'host-event',
			sourceFingerprint: 'abc123',
		});

		expect(input.classification).toBe('conversation');
		expect(input.memoryType).toBe('events');
		expect(input.content).toContain('OpenClaw Session Capture');
	});

	it('normalizes milestone records into durable promotes', () => {
		const input = normalizeSpoolRecordToPromoteInput({
			envelope: {
				agentId: 'agent-main',
				event: 'milestone',
				idempotencyKey: 'idem-2',
				payload: {
					classification: 'milestone',
					content: 'Shipped Etapa 4.',
					memoryType: 'discoveries',
				},
				sessionId: 'session-2',
				timestamp: '2026-04-15T12:00:00Z',
				version: 'v1',
			},
			hookSource: 'internal-pipeline',
			sourceFingerprint: 'def456',
		});

		expect(input.classification).toBe('milestone');
		expect(input.content).toContain('Shipped Etapa 4.');
	});
});
