import path from 'node:path';

import { McpStdioMemPalaceClient } from '../../packages/memory-mempalace/src/client/mcp-stdio-client.ts';

const shimPath = path.resolve(process.cwd(), 'fixtures/host-real/mempalace-mcp-shim.mjs');
const statePath = process.env.MEMPALACE_MCP_SHIM_STATE_PATH;
const query = process.argv[2] ?? 'stage4-hook-session';

const client = new McpStdioMemPalaceClient({
	args: [shimPath],
	command: process.execPath,
	defaultResultLimit: 8,
	defaultTokenBudget: 1200,
	env: statePath
		? {
				MEMPALACE_MCP_SHIM_STATE_PATH: statePath,
			}
		: undefined,
	timeoutMs: 5000,
	transport: 'stdio',
});

try {
	const results = await client.search({
		query,
	});
	console.log(JSON.stringify({ query, results }, null, 2));
} finally {
	await client.close();
}
