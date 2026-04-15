import fs from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';
import { resolveSpoolPaths } from './paths.js';
import {
	createHookEnvelopeFromHostEvent,
	createSpoolRecord,
	markSpoolRecordFailed,
	markSpoolRecordProcessed,
	readSpoolRecord,
	writePendingSpoolRecord,
} from './spool.js';

function resetSpool() {
	const paths = resolveSpoolPaths();
	fs.rmSync(paths.baseDir, { force: true, recursive: true });
}

describe('spool', () => {
	afterEach(() => {
		resetSpool();
	});

	it('writes a canonical hook envelope into pending spool', () => {
		const envelope = createHookEnvelopeFromHostEvent(
			{
				action: 'new',
				context: {
					agentId: 'agent-main',
				},
				sessionKey: 'session-1',
				timestamp: '2026-04-15T12:00:00Z',
				type: 'command',
			},
			{ workspaceDir: '/repo' },
		);

		const record = createSpoolRecord({
			envelope,
			hookSource: 'host-event',
		});
		const filePath = writePendingSpoolRecord(record);
		expect(fs.existsSync(filePath)).toBe(true);
		const persisted = readSpoolRecord(filePath);
		expect(persisted.envelope.idempotencyKey).toBe(envelope.idempotencyKey);
		expect(persisted.processingState).toBe('pending');
	});

	it('transitions records to processed and failed directories', () => {
		const envelope = createHookEnvelopeFromHostEvent(
			{
				action: 'reset',
				context: {
					agentId: 'agent-main',
				},
				sessionKey: 'session-2',
				timestamp: '2026-04-15T12:00:00Z',
				type: 'command',
			},
			{ workspaceDir: '/repo' },
		);
		const record = createSpoolRecord({
			envelope,
			hookSource: 'host-event',
		});
		const filePath = writePendingSpoolRecord(record);
		const processedPath = markSpoolRecordProcessed(filePath, record, {
			artifactId: 'artifact-1',
		});
		expect(fs.existsSync(processedPath)).toBe(true);

		const secondPath = writePendingSpoolRecord(record);
		const failedPath = markSpoolRecordFailed(
			secondPath,
			record,
			new Error('boom'),
		);
		expect(fs.existsSync(failedPath)).toBe(true);
	});
});
