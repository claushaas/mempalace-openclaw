import path from 'node:path';

import { McpStdioMemPalaceClient } from '../../packages/memory-mempalace/src/client/mcp-stdio-client.ts';

const shimPath = path.resolve(
	process.cwd(),
	'fixtures/host-real/mempalace-mcp-shim.mjs',
);

const statePath = process.env.MEMPALACE_MCP_SHIM_STATE_PATH;
const artifactId = process.env.MEMPALACE_SEED_ARTIFACT_ID ?? 'artifact-needle';
const content =
	process.env.MEMPALACE_SEED_CONTENT ??
	'Stable QA movie night snack preference: lemon pepper wings with blue cheese.';
const classification =
	process.env.MEMPALACE_SEED_CLASSIFICATION ?? 'decision';
const memoryType = process.env.MEMPALACE_SEED_MEMORY_TYPE ?? 'facts';
const source = process.env.MEMPALACE_SEED_SOURCE ?? 'qa-memory';
const sourcePath =
	process.env.MEMPALACE_SEED_SOURCE_PATH ?? '/memory/qa-snack.md';
const metadata =
	process.env.MEMPALACE_SEED_METADATA_JSON
		? JSON.parse(process.env.MEMPALACE_SEED_METADATA_JSON)
		: undefined;

if (!statePath) {
	throw new Error('MEMPALACE_MCP_SHIM_STATE_PATH is required.');
}

const client = new McpStdioMemPalaceClient({
	args: [shimPath],
	command: process.execPath,
	defaultResultLimit: 8,
	defaultTokenBudget: 1200,
	env: {
		MEMPALACE_MCP_SHIM_STATE_PATH: statePath,
	},
	timeoutMs: 5000,
	transport: 'stdio',
});

try {
	const artifact = await client.promote({
		artifactId,
		classification,
		content,
		...(metadata ? { metadata } : {}),
		memoryType,
		source,
		sourcePath,
	});
	await client.refreshIndex({
		force: true,
		reason: 'manual-reindex',
		target: 'runtime',
	});
	console.log(JSON.stringify({ artifact }, null, 2));
} finally {
	await client.close();
}
