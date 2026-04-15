import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { resolveSpoolPaths } from './paths.js';
import { processPendingSpool } from './processor.js';
import {
	createHookEnvelopeFromHostEvent,
	createSpoolRecord,
	writePendingSpoolRecord,
} from './spool.js';

const shimPath = path.resolve(
	process.cwd(),
	'fixtures/host-real/mempalace-mcp-shim.mjs',
);

function resetSpool() {
	const paths = resolveSpoolPaths();
	fs.rmSync(paths.baseDir, { force: true, recursive: true });
}

describe('processPendingSpool', () => {
	afterEach(() => {
		resetSpool();
	});

	it('ingests pending spool records into the MCP shim and marks them processed', async () => {
		const statePath = path.join(
			resolveSpoolPaths().baseDir,
			'test-mcp-state.json',
		);
		const record = createSpoolRecord({
			envelope: createHookEnvelopeFromHostEvent(
				{
					action: 'new',
					context: {
						agentId: 'agent-main',
					},
					sessionKey: 'session-stage4',
					timestamp: '2026-04-15T12:00:00Z',
					type: 'command',
				},
				{
					workspaceDir: '/repo',
				},
			),
			hookSource: 'host-event',
		});
		writePendingSpoolRecord(record);

		const result = await processPendingSpool({
			cfg: {
				plugins: {
					entries: {
						'memory-mempalace': {
							config: {
								args: [shimPath],
								command: process.execPath,
								env: {
									MEMPALACE_MCP_SHIM_STATE_PATH: statePath,
								},
								timeoutMs: 5000,
								transport: 'stdio',
							},
						},
					},
				},
			},
		});

		expect(result.processed).toBe(1);
		const paths = resolveSpoolPaths();
		expect(fs.readdirSync(paths.pendingDir)).toHaveLength(0);
		expect(fs.readdirSync(paths.processedDir).length).toBeGreaterThan(0);

		const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
		expect(
			Object.keys(state.artifacts).some((key) =>
				key.includes('session-session-stage4'),
			),
		).toBe(true);
	});
});
