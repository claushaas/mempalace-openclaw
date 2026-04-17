import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';

import {
	type AgentDiaryAppendInput,
	type AgentDiaryEntry,
	AgentDiaryEntrySchema,
	type AgentDiaryQuery,
	ArtifactNotFoundError,
	BackendUnavailableError,
	createFingerprint,
	type JsonValue,
	type MemoryArtifact,
	MemoryArtifactSchema,
	parseWithSchema,
} from '@mempalace-openclaw/shared';

type JsonRpcRequest = {
	id?: number;
	jsonrpc: '2.0';
	method: string;
	params?: Record<string, unknown>;
};

type JsonRpcMessage =
	| {
			error: { message: string };
			id: number | null;
			jsonrpc: '2.0';
	  }
	| {
			id: number;
			jsonrpc: '2.0';
			result: unknown;
	  }
	| {
			jsonrpc: '2.0';
			method: string;
			params?: unknown;
	  };

type McpToolCallResponse = {
	content?: Array<{ text?: string; type: string }>;
	structuredContent?: unknown;
};

export type ContextEngineMemoryBackendConfig = {
	args: string[];
	command: string;
	cwd?: string;
	env?: Record<string, string>;
	timeoutMs: number;
};

const PROTOCOL_VERSIONS = ['2025-06-18', '2024-11-05'] as const;

function coerceStructuredPayload(result: unknown): unknown {
	if (
		result &&
		typeof result === 'object' &&
		'structuredContent' in result &&
		(result as McpToolCallResponse).structuredContent !== undefined
	) {
		return (result as McpToolCallResponse).structuredContent;
	}

	if (
		result &&
		typeof result === 'object' &&
		Array.isArray((result as McpToolCallResponse).content)
	) {
		const text = ((result as McpToolCallResponse).content ?? [])
			.map((entry) => entry.text ?? '')
			.join('\n')
			.trim();
		if (!text) {
			return null;
		}
		try {
			return JSON.parse(text);
		} catch {
			return text;
		}
	}

	return result;
}

function normalizeDiaryArtifact(artifact: MemoryArtifact): AgentDiaryEntry {
	return parseWithSchema(
		AgentDiaryEntrySchema,
		{
			agentId:
				artifact.agentId ??
				(typeof artifact.metadata?.agentId === 'string'
					? artifact.metadata.agentId
					: undefined) ??
				'unknown-agent',
			content: artifact.content,
			entryId:
				typeof artifact.metadata?.entryId === 'string'
					? artifact.metadata.entryId
					: artifact.artifactId.replace(/^diary-/, ''),
			metadata: artifact.metadata,
			sessionId:
				artifact.sessionId ??
				(typeof artifact.metadata?.sessionId === 'string'
					? artifact.metadata.sessionId
					: undefined),
			source: artifact.source,
			sourcePath: artifact.sourcePath,
			subagentId:
				typeof artifact.metadata?.subagentId === 'string'
					? artifact.metadata.subagentId
					: undefined,
			updatedAt: artifact.updatedAt,
		},
		'Invalid diary artifact fallback payload.',
	);
}

function createDiaryFingerprintPayload(
	input: AgentDiaryAppendInput,
): Record<string, JsonValue> {
	return {
		agentId: input.agentId,
		content: input.content,
		...(input.entryId ? { entryId: input.entryId } : {}),
		...(input.metadata ? { metadata: input.metadata } : {}),
		...(input.sessionId ? { sessionId: input.sessionId } : {}),
		...(input.subagentId ? { subagentId: input.subagentId } : {}),
	};
}

class StdioMcpConnection {
	private child: ChildProcessWithoutNullStreams | null = null;

	private availableTools: Set<string> | null = null;

	private nextId = 1;

	private pending = new Map<
		number,
		{
			reject: (reason?: unknown) => void;
			resolve: (value: unknown) => void;
		}
	>();

	private readBuffer = '';

	private started = false;

	private starting: Promise<void> | null = null;

	public constructor(
		private readonly config: ContextEngineMemoryBackendConfig,
	) {}

	public async close(): Promise<void> {
		for (const pending of this.pending.values()) {
			pending.reject(new Error('MCP connection closed.'));
		}
		this.pending.clear();
		if (this.child) {
			this.child.kill();
		}
		this.child = null;
		this.availableTools = null;
		this.started = false;
		this.starting = null;
	}

	public async listTools(): Promise<Set<string>> {
		await this.ensureStarted();
		if (this.availableTools) {
			return this.availableTools;
		}
		const result = await this.request('tools/list', {});
		const tools = new Set<string>();
		if (
			result &&
			typeof result === 'object' &&
			Array.isArray((result as { tools?: Array<{ name?: string }> }).tools)
		) {
			for (const tool of (result as { tools: Array<{ name?: string }> })
				.tools) {
				if (tool.name) {
					tools.add(tool.name);
				}
			}
		}
		this.availableTools = tools;
		return tools;
	}

	public async request(
		method: string,
		params: Record<string, unknown>,
	): Promise<unknown> {
		await this.ensureStarted();
		return this.requestOnce(method, params);
	}

	private async requestOnce(
		method: string,
		params: Record<string, unknown>,
	): Promise<unknown> {
		const id = this.nextId++;
		const message: JsonRpcRequest = { id, jsonrpc: '2.0', method, params };
		return new Promise<unknown>((resolve, reject) => {
			this.pending.set(id, { reject, resolve });
			this.writeMessage(message);
			setTimeout(() => {
				if (!this.pending.has(id)) {
					return;
				}
				this.pending.delete(id);
				reject(new Error(`Timed out waiting for MCP response to ${method}.`));
			}, this.config.timeoutMs);
		});
	}

	private async ensureStarted(): Promise<void> {
		if (this.started) {
			return;
		}
		if (this.starting) {
			await this.starting;
			return;
		}
		this.starting = (async () => {
			for (const protocolVersion of PROTOCOL_VERSIONS) {
				try {
					await this.start(protocolVersion);
					this.started = true;
					return;
				} catch {
					await this.close();
				}
			}
			throw new BackendUnavailableError(
				'Failed to initialize context-engine MCP stdio connection.',
			);
		})();
		try {
			await this.starting;
		} finally {
			this.starting = null;
		}
	}

	private onStdout(chunk: string): void {
		this.readBuffer += chunk;
		while (true) {
			const headerEnd = this.readBuffer.indexOf('\r\n\r\n');
			if (headerEnd === -1) {
				return;
			}
			const header = this.readBuffer.slice(0, headerEnd);
			const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
			if (!contentLengthMatch) {
				return;
			}
			const contentLength = Number.parseInt(contentLengthMatch[1] ?? '0', 10);
			const messageStart = headerEnd + 4;
			const messageEnd = messageStart + contentLength;
			if (this.readBuffer.length < messageEnd) {
				return;
			}
			const rawMessage = this.readBuffer.slice(messageStart, messageEnd);
			this.readBuffer = this.readBuffer.slice(messageEnd);
			const message = JSON.parse(rawMessage) as JsonRpcMessage;
			if (!('id' in message) || typeof message.id !== 'number') {
				continue;
			}
			const pending = this.pending.get(message.id);
			if (!pending) {
				continue;
			}
			this.pending.delete(message.id);
			if ('error' in message) {
				pending.reject(new Error(message.error.message));
				continue;
			}
			pending.resolve(message.result);
		}
	}

	private async start(protocolVersion: string): Promise<void> {
		this.child = spawn(this.config.command, this.config.args, {
			cwd: this.config.cwd,
			env: {
				...process.env,
				...(this.config.env ?? {}),
			},
			stdio: 'pipe',
		});
		this.child.stdout.setEncoding('utf8');
		this.child.stdout.on('data', (chunk: string | Buffer) =>
			this.onStdout(String(chunk)),
		);
		this.child.stderr.setEncoding('utf8');
		await this.requestRawInitialize(protocolVersion);
		this.writeMessage({
			jsonrpc: '2.0',
			method: 'notifications/initialized',
		});
	}

	private async requestRawInitialize(protocolVersion: string): Promise<void> {
		await this.requestOnce('initialize', {
			capabilities: {},
			clientInfo: {
				name: 'context-engine-mempalace',
				version: '0.0.0',
			},
			protocolVersion,
		});
	}

	private writeMessage(message: JsonRpcRequest | JsonRpcMessage): void {
		if (!this.child) {
			throw new Error('MCP child process is not running.');
		}
		const encoded = JSON.stringify(message);
		this.child.stdin.write(
			`Content-Length: ${Buffer.byteLength(encoded, 'utf8')}\r\n\r\n${encoded}`,
		);
	}
}

export class ContextEngineDiaryClient {
	private readonly connection: StdioMcpConnection;

	public constructor(config: ContextEngineMemoryBackendConfig) {
		this.connection = new StdioMcpConnection(config);
	}

	public async appendDiaryEntry(
		input: AgentDiaryAppendInput,
	): Promise<AgentDiaryEntry> {
		const tools = await this.connection.listTools();
		if (tools.has('mempalace_diary_append')) {
			const payload = await this.callTool('mempalace_diary_append', input);
			return parseWithSchema(
				AgentDiaryEntrySchema,
				payload,
				'Invalid diary append payload.',
			);
		}

		const entryId =
			input.entryId ?? createFingerprint(createDiaryFingerprintPayload(input));
		const artifact = await this.callTool('mempalace_add_drawer', {
			agentId: input.agentId,
			artifactId: `diary-${entryId}`,
			classification: 'conversation',
			content: input.content,
			memoryType: 'events',
			metadata: {
				...(input.metadata ?? {}),
				agentId: input.agentId,
				entryId,
				recordKind: 'agent-diary',
				...(input.subagentId
					? {
							subagentId: input.subagentId,
						}
					: {}),
			},
			...(input.sessionId
				? {
						sessionId: input.sessionId,
					}
				: {}),
			source: `agent-diary:${input.agentId}`,
			sourcePath: `/diaries/${input.agentId}/${new Date()
				.toISOString()
				.slice(0, 10)}/${entryId}.json`,
		});
		return normalizeDiaryArtifact(
			parseWithSchema(
				MemoryArtifactSchema,
				artifact,
				'Invalid fallback diary artifact.',
			),
		);
	}

	public async listDiaryEntries(
		query: AgentDiaryQuery,
	): Promise<AgentDiaryEntry[]> {
		const tools = await this.connection.listTools();
		if (tools.has('mempalace_diary_list')) {
			const payload = await this.callTool('mempalace_diary_list', query);
			if (!Array.isArray(payload)) {
				return [];
			}
			return payload.map((entry) =>
				parseWithSchema(
					AgentDiaryEntrySchema,
					entry,
					'Invalid diary list payload.',
				),
			);
		}

		const payload = await this.callTool('mempalace_search', {
			limit: query.limit ?? 6,
			query: query.agentId,
		});
		if (!Array.isArray(payload)) {
			return [];
		}
		const diaryEntries: AgentDiaryEntry[] = [];
		for (const result of payload) {
			const artifactId =
				result &&
				typeof result === 'object' &&
				typeof (result as { artifactId?: unknown }).artifactId === 'string'
					? ((result as { artifactId: string }).artifactId ?? '')
					: '';
			const source =
				result &&
				typeof result === 'object' &&
				typeof (result as { source?: unknown }).source === 'string'
					? (result as { source: string }).source
					: '';
			if (!artifactId || source !== `agent-diary:${query.agentId}`) {
				continue;
			}
			try {
				diaryEntries.push(
					await this.getDiaryEntry(artifactId.replace(/^diary-/, '')),
				);
			} catch {
				// keep best-effort fallback
			}
		}
		return diaryEntries;
	}

	public async getDiaryEntry(entryId: string): Promise<AgentDiaryEntry> {
		const tools = await this.connection.listTools();
		if (tools.has('mempalace_diary_get')) {
			const payload = await this.callTool('mempalace_diary_get', {
				entryId,
			});
			return parseWithSchema(
				AgentDiaryEntrySchema,
				payload,
				'Invalid diary get payload.',
			);
		}

		const payload = await this.callTool('mempalace_get_drawer', {
			artifactId: `diary-${entryId}`,
		});
		if (!payload || typeof payload !== 'object') {
			throw new ArtifactNotFoundError(entryId);
		}
		return normalizeDiaryArtifact(
			parseWithSchema(
				MemoryArtifactSchema,
				payload,
				'Invalid fallback diary artifact payload.',
			),
		);
	}

	public async capabilities(): Promise<Set<string>> {
		return this.connection.listTools();
	}

	public async close(): Promise<void> {
		await this.connection.close();
	}

	private async callTool(
		name: string,
		args: Record<string, unknown>,
	): Promise<unknown> {
		const payload = await this.connection.request('tools/call', {
			arguments: args,
			name,
		});
		return coerceStructuredPayload(payload);
	}
}
