import { describe, expect, it } from 'vitest';

import { McpStdioMemPalaceClient } from './mcp-stdio-client.js';

const shimPath = new URL(
	'../../../../fixtures/host-real/mempalace-mcp-shim.mjs',
	import.meta.url,
);

describe('McpStdioMemPalaceClient', () => {
	it('searches, gets artifacts and reads status over MCP stdio', async () => {
		const client = new McpStdioMemPalaceClient({
			args: [shimPath.pathname],
			command: process.execPath,
			defaultResultLimit: 8,
			defaultTokenBudget: 1200,
			timeoutMs: 5000,
			transport: 'stdio',
		});

		const results = await client.search({
			query: 'decision memory',
		});
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.artifactId).toBe('artifact-decision');

		const artifact = await client.get('artifact-decision');
		expect(artifact.content).toContain('Use MCP as the backend seam');

		const health = await client.getHealth();
		expect(health.status).toBe('ready');

		const sources = await client.listSourcesStatus();
		expect(sources).toHaveLength(2);

		await client.close();
	});
});
