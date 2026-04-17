import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ARTIFACTS = [
	{
		artifactId: 'artifact-decision',
		classification: 'decision',
		content:
			'Use MCP as the backend seam for the OpenClaw memory runtime.',
		memoryType: 'facts',
		source: 'repo-main',
		sourcePath: '/repo/decision.md',
		sourceType: 'filesystem',
		metadata: {
			pinned: true,
			pinScope: 'global',
		},
		title: 'Backend seam decision',
		updatedAt: '2026-04-15T12:00:00Z',
	},
	{
		artifactId: 'artifact-conversation',
		classification: 'conversation',
		content: 'Conversation about the gateway memory slot and ranking.',
		memoryType: 'events',
		source: 'session-log',
		sourcePath: '/sessions/thread.md',
		sourceType: 'sessions',
		title: 'Gateway slot conversation',
		updatedAt: '2026-04-14T12:00:00Z',
	},
	{
		artifactId: 'artifact-external',
		classification: 'artifact',
		content: 'External artifact with structural context for code recall.',
		memoryType: 'discoveries',
		source: 'obsidian-main',
		sourcePath: '/vault/design.md',
		sourceType: 'filesystem',
		title: 'Design note',
		updatedAt: '2026-04-13T12:00:00Z',
	},
];

const DEFAULT_SOURCES = [
	{
		enabled: true,
		kind: 'filesystem',
		lastSyncedAt: '2026-04-15T12:00:00Z',
		path: '/repo',
		sourceId: 'repo-main',
	},
	{
		enabled: true,
		kind: 'filesystem',
		lastSyncedAt: '2026-04-14T12:00:00Z',
		path: '/vault',
		sourceId: 'obsidian-main',
	},
];

const DEFAULT_LAST_REFRESH_AT = '2026-04-15T12:00:00Z';
const statePath = process.env.MEMPALACE_MCP_SHIM_STATE_PATH;

function buildDefaultState() {
	return {
		artifacts: Object.fromEntries(
			DEFAULT_ARTIFACTS.map((artifact) => [artifact.artifactId, artifact]),
		),
		diaries: {},
		graph: {
			expansions: {
				'recall cinema preference': ['qa', 'movie', 'night', 'snack', 'lemon', 'pepper', 'wings'],
				'movie night preference': ['qa', 'snack', 'lemon', 'pepper', 'wings'],
			},
			relations: [],
		},
		lastRefreshAt: DEFAULT_LAST_REFRESH_AT,
		sources: DEFAULT_SOURCES,
	};
}

function ensureStateDir() {
	if (!statePath) {
		return;
	}
	fs.mkdirSync(path.dirname(statePath), { recursive: true });
}

function readState() {
	if (!statePath || !fs.existsSync(statePath)) {
		return buildDefaultState();
	}
	return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function writeState(nextState) {
	if (!statePath) {
		return;
	}
	ensureStateDir();
	fs.writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`);
}

let state = readState();

function writeMessage(message) {
	const encoded = JSON.stringify(message);
	process.stdout.write(
		`Content-Length: ${Buffer.byteLength(encoded, 'utf8')}\r\n\r\n${encoded}`,
	);
}

function respond(id, result) {
	writeMessage({
		id,
		jsonrpc: '2.0',
		result,
	});
}

function respondTool(id, payload) {
	respond(id, {
		content: [
			{
				text: JSON.stringify(payload),
				type: 'text',
			},
		],
		structuredContent: payload,
	});
}

function respondError(id, code, message) {
	writeMessage({
		error: {
			code,
			message,
		},
		id,
		jsonrpc: '2.0',
	});
}

function listTools() {
	return {
		tools: [
			{
				description: 'Search MemPalace drawers.',
				name: 'mempalace_search',
			},
			{
				description: 'Get a full drawer artifact.',
				name: 'mempalace_get_drawer',
			},
			{
				description: 'Add or promote a drawer.',
				name: 'mempalace_add_drawer',
			},
			{
				description: 'Refresh the MemPalace runtime index.',
				name: 'mempalace_refresh_index',
			},
			{
				description: 'Inspect MemPalace runtime status.',
				name: 'mempalace_status',
			},
			{
				description: 'Upsert simple knowledge graph entities and relations.',
				name: 'mempalace_graph_upsert',
			},
			{
				description: 'Expand a query from the knowledge graph.',
				name: 'mempalace_graph_expand_query',
			},
			{
				description: 'Append an agent diary entry.',
				name: 'mempalace_diary_append',
			},
			{
				description: 'List agent diary entries.',
				name: 'mempalace_diary_list',
			},
			{
				description: 'Get a single diary entry.',
				name: 'mempalace_diary_get',
			},
		],
	};
}

function searchArtifacts(query, limit = 8) {
	const normalizedQuery = String(query ?? '').toLowerCase();
	const terms = normalizedQuery.split(/\s+/).filter(Boolean);

	const results = Object.values(state.artifacts)
		.map((artifact) => {
			const haystack = [
				artifact.title,
				artifact.content,
				artifact.source,
				artifact.sourcePath,
			]
				.join(' ')
				.toLowerCase();
			const matches = terms.filter((term) => haystack.includes(term)).length;
			const score = terms.length === 0 ? 0.1 : matches / terms.length;
			return {
				artifactId: artifact.artifactId,
				classification: artifact.classification,
				metadata: artifact.metadata,
				memoryType: artifact.memoryType,
				retrievalReason: artifact.retrievalReason,
				score,
				snippet: artifact.content.slice(0, 160),
				source: artifact.source,
				sourcePath: artifact.sourcePath,
				sourceType: artifact.sourceType,
				updatedAt: artifact.updatedAt,
			};
		})
		.filter((result) => result.score > 0 || normalizedQuery.includes(result.artifactId))
		.sort((left, right) => right.score - left.score)
		.slice(0, limit);

	return results;
}

function handleToolCall(id, params) {
	const name = params?.name;
	const args = params?.arguments ?? {};

	switch (name) {
		case 'mempalace_search':
			respondTool(id, searchArtifacts(args.query, args.limit));
			return;
		case 'mempalace_get_drawer': {
			const artifact = state.artifacts[args.artifactId];
			if (!artifact) {
				respondError(id, -32004, `Artifact not found: ${args.artifactId}`);
				return;
			}
			respondTool(id, artifact);
			return;
		}
		case 'mempalace_add_drawer': {
			const artifactId = args.artifactId ?? `artifact-${Date.now()}`;
			const artifact = {
				artifactId,
				classification: args.classification ?? 'artifact',
				content: args.content ?? 'promoted content',
				...(args.metadata && typeof args.metadata === 'object' && !Array.isArray(args.metadata)
					? { metadata: args.metadata }
					: {}),
				memoryType: args.memoryType ?? 'discoveries',
				source: args.source ?? 'manual',
				sourcePath: args.sourcePath ?? `/manual/${artifactId}.md`,
				sourceType: 'manual',
				updatedAt: new Date().toISOString(),
			};
			state = {
				...state,
				artifacts: {
					...state.artifacts,
					[artifactId]: artifact,
				},
			};
			writeState(state);
			respondTool(id, artifact);
			return;
		}
		case 'mempalace_refresh_index':
			state = {
				...state,
				lastRefreshAt: new Date().toISOString(),
			};
			writeState(state);
			respondTool(id, {
				accepted: true,
				force: Boolean(args.force),
				reason: args.reason ?? 'manual-reindex',
				sourceId: args.sourceId,
				target: args.target,
			});
			return;
		case 'mempalace_status':
			respondTool(id, {
				health: {
					backendReachable: true,
					lastRefreshAt: state.lastRefreshAt,
					status: 'ready',
				},
				sources: state.sources,
			});
			return;
		case 'mempalace_graph_upsert': {
			state = {
				...state,
				graph: {
					...(state.graph ?? { expansions: {}, relations: [] }),
					relations: [
						...((state.graph?.relations ?? [])),
						...(Array.isArray(args.relations) ? args.relations : []),
					],
				},
			};
			writeState(state);
			respondTool(id, {
				accepted: true,
				entityCount: Array.isArray(args.entities) ? args.entities.length : 0,
				relationCount: Array.isArray(args.relations) ? args.relations.length : 0,
			});
			return;
		}
		case 'mempalace_graph_expand_query': {
			const normalizedQuery = String(args.query ?? '').toLowerCase().trim();
			const expandedTerms =
				state.graph?.expansions?.[normalizedQuery] ??
				(normalizedQuery.includes('cinema')
					? ['qa', 'movie', 'night', 'snack', 'lemon', 'pepper', 'wings']
					: []);
			respondTool(id, {
				expandedTerms,
				reason: expandedTerms.length > 0 ? 'shim-graph-expansion' : 'shim-no-expansion',
			});
			return;
		}
		case 'mempalace_diary_append': {
			const entryId = args.entryId ?? `diary-${Date.now()}`;
			const diaryEntry = {
				agentId: args.agentId ?? 'unknown-agent',
				content: args.content ?? '',
				entryId,
				metadata:
					args.metadata && typeof args.metadata === 'object' && !Array.isArray(args.metadata)
						? args.metadata
						: {},
				sessionId: args.sessionId,
				source: `agent-diary:${args.agentId ?? 'unknown-agent'}`,
				sourcePath: `/diaries/${args.agentId ?? 'unknown-agent'}/${entryId}.json`,
				subagentId: args.subagentId,
				updatedAt: new Date().toISOString(),
			};
			state = {
				...state,
				diaries: {
					...(state.diaries ?? {}),
					[entryId]: diaryEntry,
				},
				artifacts: {
					...state.artifacts,
					[`diary-${entryId}`]: {
						artifactId: `diary-${entryId}`,
						classification: 'conversation',
						content: diaryEntry.content,
						metadata: {
							...(diaryEntry.metadata ?? {}),
							agentId: diaryEntry.agentId,
							entryId,
							recordKind: 'agent-diary',
							...(diaryEntry.subagentId ? { subagentId: diaryEntry.subagentId } : {}),
						},
						memoryType: 'events',
						source: diaryEntry.source,
						sourcePath: diaryEntry.sourcePath,
						sourceType: 'manual',
						updatedAt: diaryEntry.updatedAt,
					},
				},
			};
			writeState(state);
			respondTool(id, diaryEntry);
			return;
		}
		case 'mempalace_diary_list': {
			const entries = Object.values(state.diaries ?? {})
				.filter((entry) => entry.agentId === args.agentId)
				.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
				.slice(0, Number(args.limit ?? 8));
			respondTool(id, entries);
			return;
		}
		case 'mempalace_diary_get': {
			const entry = state.diaries?.[args.entryId];
			if (!entry) {
				respondError(id, -32004, `Diary entry not found: ${args.entryId}`);
				return;
			}
			respondTool(id, entry);
			return;
		}
		default:
			respondError(id, -32601, `Unknown tool: ${name}`);
	}
}

let buffer = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
	buffer += chunk;

	while (true) {
		const headerEnd = buffer.indexOf('\r\n\r\n');
		if (headerEnd === -1) {
			return;
		}

		const header = buffer.slice(0, headerEnd);
		const match = header.match(/Content-Length:\s*(\d+)/i);
		if (!match) {
			throw new Error('Missing Content-Length header');
		}
		const length = Number.parseInt(match[1], 10);
		const bodyStart = headerEnd + 4;
		const bodyEnd = bodyStart + length;
		if (buffer.length < bodyEnd) {
			return;
		}

		const body = buffer.slice(bodyStart, bodyEnd);
		buffer = buffer.slice(bodyEnd);
		const message = JSON.parse(body);

		if (message.method === 'initialize') {
			respond(message.id, {
				capabilities: {
					tools: {},
				},
				protocolVersion: message.params?.protocolVersion ?? '2025-06-18',
				serverInfo: {
					name: 'mempalace-mcp-shim',
					version: '0.0.0-test',
				},
			});
			continue;
		}

		if (message.method === 'notifications/initialized') {
			continue;
		}

		if (message.method === 'tools/list') {
			respond(message.id, listTools());
			continue;
		}

		if (message.method === 'tools/call') {
			handleToolCall(message.id, message.params);
			continue;
		}

		respondError(message.id ?? null, -32601, `Unknown method: ${message.method}`);
	}
});
