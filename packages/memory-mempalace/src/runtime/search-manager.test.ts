import type { MemPalaceClient } from '@mempalace-openclaw/shared';
import { describe, expect, it } from 'vitest';
import { MemPalaceMemorySearchManager } from './search-manager.js';
import { MemoryRuntimeService } from './service.js';

const fakeClient: MemPalaceClient = {
	async get(artifactId) {
		return {
			artifactId,
			classification: 'artifact',
			content: 'full artifact content',
			source: 'repo-main',
			sourcePath: '/repo/file.md',
			sourceType: 'filesystem',
			updatedAt: '2026-04-15T12:00:00Z',
		};
	},
	async getHealth() {
		return {
			backendReachable: true,
			status: 'ready',
		};
	},
	async listSourcesStatus() {
		return [
			{
				enabled: true,
				kind: 'filesystem',
				path: '/repo',
				sourceId: 'repo-main',
			},
		];
	},
	async promote(input) {
		return {
			artifactId: input.artifactId ?? 'artifact-promoted',
			classification: input.classification,
			content: input.content ?? 'promoted',
			source: input.source,
			sourcePath: input.sourcePath ?? '/repo/promoted.md',
			sourceType: 'manual',
			updatedAt: '2026-04-15T12:00:00Z',
		};
	},
	async refreshIndex(request) {
		return {
			accepted: true,
			reason: request.reason,
		};
	},
	async search() {
		return [
			{
				artifactId: 'artifact-1',
				classification: 'artifact',
				score: 0.8,
				snippet: 'artifact snippet',
				source: 'repo-main',
				sourcePath: '/repo/file.md',
				sourceType: 'filesystem',
				updatedAt: '2026-04-15T12:00:00Z',
			},
		];
	},
};

describe('MemPalaceMemorySearchManager', () => {
	it('maps runtime methods to the host search manager surface', async () => {
		const service = new MemoryRuntimeService(fakeClient);
		const manager = new MemPalaceMemorySearchManager(
			service,
			await service.status(),
		);

		const results = await manager.search('artifact');
		expect(results[0]?.path).toBe('artifact-1');

		const file = await manager.readFile({
			relPath: 'artifact-1',
		});
		expect(file.text).toContain('full artifact content');

		await expect(manager.sync()).resolves.toBeUndefined();
		expect(manager.status().provider).toBe('mempalace-mcp');
	});
});
