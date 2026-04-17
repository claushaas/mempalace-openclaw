import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';

import {
	ArtifactNotFoundError,
	BackendUnavailableError,
	type KnowledgeGraphUpsertInput,
	type MemoryArtifact,
	MemoryArtifactSchema,
	type MemoryIndexRequest,
	type MemoryPromoteInput,
	type MemorySearchQuery,
	type MemorySearchResult,
	MemorySearchResultSchema,
	type MemPalaceKnowledgeGraphClient,
	type MemPalaceRefreshResult,
	parseWithSchema,
	type RuntimeHealth,
	RuntimeHealthSchema,
	type SourceStatus,
	SourceStatusSchema,
} from '@mempalace-openclaw/shared';

import type { MemoryBackendConfig } from '../config/runtime.js';

type JsonRpcRequest = {
	id?: number;
	jsonrpc: '2.0';
	method: string;
	params?: Record<string, unknown>;
};

type JsonRpcSuccess = {
	id: number;
	jsonrpc: '2.0';
	result: unknown;
};

type JsonRpcFailure = {
	error: {
		code: number;
		data?: unknown;
		message: string;
	};
	id: number | null;
	jsonrpc: '2.0';
};

type JsonRpcMessage =
	| JsonRpcSuccess
	| JsonRpcFailure
	| {
			jsonrpc: '2.0';
			method: string;
			params?: unknown;
	  };

type McpToolCallResponse = {
	content?: Array<{ text?: string; type: string }>;
	isError?: boolean;
	structuredContent?: unknown;
};

const PROTOCOL_VERSIONS = ['2025-06-18', '2024-11-05'] as const;

function isFailureMessage(message: JsonRpcMessage): message is JsonRpcFailure {
	return 'error' in message;
}

function isSuccessMessage(message: JsonRpcMessage): message is JsonRpcSuccess {
	return 'result' in message && 'id' in message;
}

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
		if (text.length === 0) {
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

function buildTransportError(
	message: string,
	options?: {
		cause?: unknown;
		stderr?: string;
	},
): BackendUnavailableError {
	return new BackendUnavailableError(
		message,
		options?.cause,
		options?.stderr ? { stderr: options.stderr } : undefined,
	);
}

class StdioMcpConnection {
	private readonly args: string[];

	private readonly command: string;

	private readonly cwd: string | undefined;

	private readonly env: Record<string, string> | undefined;

	private readonly timeoutMs: number;

	private child: ChildProcessWithoutNullStreams | null = null;

	private readonly pending = new Map<
		number,
		{ reject: (reason?: unknown) => void; resolve: (value: unknown) => void }
	>();

	private readBuffer = '';

	private nextId = 1;

	private started = false;

	private availableTools: Set<string> | null = null;

	private stderrBuffer = '';

	private starting: Promise<void> | null = null;

	public constructor(config: MemoryBackendConfig) {
		this.args = config.args;
		this.command = config.command;
		this.cwd = config.cwd;
		this.env = config.env;
		this.timeoutMs = config.timeoutMs;
	}

	public async close(): Promise<void> {
		this.rejectPending(new Error('MCP connection closed.'));
		if (this.child) {
			this.child.kill();
		}
		this.child = null;
		this.started = false;
		this.starting = null;
		this.availableTools = null;
	}

	public async ensureStarted(): Promise<void> {
		if (this.started) {
			return;
		}
		if (this.starting) {
			await this.starting;
			return;
		}

		this.starting = (async () => {
			let lastError: unknown;
			for (const protocolVersion of PROTOCOL_VERSIONS) {
				try {
					await this.start(protocolVersion);
					this.started = true;
					return;
				} catch (error) {
					lastError = error;
					await this.close();
				}
			}

			throw buildTransportError('Failed to initialize MCP stdio connection.', {
				cause: lastError,
				stderr: this.stderrBuffer,
			});
		})();

		try {
			await this.starting;
		} finally {
			this.starting = null;
		}
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
		const payload: JsonRpcRequest = { id, jsonrpc: '2.0', method, params };

		const response = await new Promise<unknown>((resolve, reject) => {
			this.pending.set(id, { reject, resolve });
			this.writeMessage(payload);
			const timeout = setTimeout(() => {
				if (!this.pending.has(id)) {
					return;
				}
				this.pending.delete(id);
				reject(
					buildTransportError(
						`Timed out waiting for MCP response to ${method}.`,
						{
							stderr: this.stderrBuffer,
						},
					),
				);
			}, this.timeoutMs);
			const current = this.pending.get(id);
			if (current) {
				this.pending.set(id, {
					reject: (reason) => {
						clearTimeout(timeout);
						current.reject(reason);
					},
					resolve: (value) => {
						clearTimeout(timeout);
						current.resolve(value);
					},
				});
			}
		});

		return response;
	}

	private async start(protocolVersion: string): Promise<void> {
		if (!this.command) {
			throw buildTransportError('MCP stdio command is not configured.');
		}

		this.child = spawn(this.command, this.args, {
			cwd: this.cwd,
			env: {
				...process.env,
				...this.env,
			},
			stdio: 'pipe',
		});
		this.child.stdout.setEncoding('utf8');
		this.child.stdout.on('data', (chunk: string | Buffer) => {
			this.onStdout(String(chunk));
		});
		this.child.stderr.setEncoding('utf8');
		this.child.stderr.on('data', (chunk: string | Buffer) => {
			this.stderrBuffer += String(chunk);
		});
		this.child.on('exit', (code, signal) => {
			if (!this.started && code !== 0) {
				this.rejectPending(
					buildTransportError(
						`MCP process exited before initialization (code=${code}, signal=${signal}).`,
						{
							stderr: this.stderrBuffer,
						},
					),
				);
			}
			if (this.started) {
				this.rejectPending(
					buildTransportError(
						`MCP process exited unexpectedly (code=${code}, signal=${signal}).`,
						{
							stderr: this.stderrBuffer,
						},
					),
				);
			}
		});

		const initializeResult = await this.requestOnce('initialize', {
			capabilities: {},
			clientInfo: {
				name: 'sync-daemon',
				version: '0.0.0',
			},
			protocolVersion,
		});
		if (!initializeResult || typeof initializeResult !== 'object') {
			throw buildTransportError('MCP initialize returned an invalid result.');
		}

		this.writeMessage({
			jsonrpc: '2.0',
			method: 'notifications/initialized',
		});
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
				throw buildTransportError(
					'MCP response missing Content-Length header.',
					{
						stderr: this.stderrBuffer,
					},
				);
			}
			const contentLengthHeader = contentLengthMatch[1];
			if (!contentLengthHeader) {
				throw buildTransportError(
					'MCP response missing Content-Length value.',
					{
						stderr: this.stderrBuffer,
					},
				);
			}
			const contentLength = Number.parseInt(contentLengthHeader, 10);
			const messageStart = headerEnd + 4;
			const messageEnd = messageStart + contentLength;
			if (this.readBuffer.length < messageEnd) {
				return;
			}

			const rawMessage = this.readBuffer.slice(messageStart, messageEnd);
			this.readBuffer = this.readBuffer.slice(messageEnd);
			const message = JSON.parse(rawMessage) as JsonRpcMessage;

			if (!('id' in message)) {
				continue;
			}
			const pending = this.pending.get(message.id as number);
			if (!pending) {
				continue;
			}
			this.pending.delete(message.id as number);

			if (isFailureMessage(message)) {
				pending.reject(
					buildTransportError(message.error.message, {
						stderr: this.stderrBuffer,
					}),
				);
				continue;
			}

			if (isSuccessMessage(message)) {
				pending.resolve(message.result);
			}
		}
	}

	private rejectPending(error: Error): void {
		for (const [id, pending] of this.pending) {
			this.pending.delete(id);
			pending.reject(error);
		}
	}

	private writeMessage(payload: JsonRpcRequest): void {
		if (!this.child) {
			throw buildTransportError('MCP stdio child is not available.', {
				stderr: this.stderrBuffer,
			});
		}

		const encoded = JSON.stringify(payload);
		const frame = `Content-Length: ${Buffer.byteLength(encoded, 'utf8')}\r\n\r\n${encoded}`;
		this.child.stdin.write(frame);
	}
}

async function callTool(
	connection: StdioMcpConnection,
	name: string,
	payload: Record<string, unknown>,
): Promise<unknown> {
	const tools = await connection.listTools();
	if (!tools.has(name)) {
		throw new BackendUnavailableError(`MCP tool not found: ${name}`);
	}

	const result = await connection.request('tools/call', {
		arguments: payload,
		name,
	});

	return coerceStructuredPayload(result);
}

function normalizeSearchResults(payload: unknown): MemorySearchResult[] {
	if (!Array.isArray(payload)) {
		return [];
	}
	return payload.map((entry) =>
		parseWithSchema(
			MemorySearchResultSchema,
			entry,
			'Invalid memory search result.',
		),
	);
}

function normalizeArtifact(
	payload: unknown,
	artifactId: string,
): MemoryArtifact {
	const candidate =
		payload &&
		typeof payload === 'object' &&
		'artifact' in payload &&
		(payload as { artifact?: unknown }).artifact !== undefined
			? (payload as { artifact: unknown }).artifact
			: payload;

	if (!candidate) {
		throw new ArtifactNotFoundError(artifactId);
	}

	return parseWithSchema(
		MemoryArtifactSchema,
		candidate,
		'Invalid memory artifact payload.',
	);
}

function normalizeStatusPayload(payload: unknown): {
	health: RuntimeHealth;
	sources: SourceStatus[];
} {
	if (!payload || typeof payload !== 'object') {
		throw buildTransportError('Invalid MemPalace status payload.', {
			stderr: '',
		});
	}

	const record = payload as {
		health?: unknown;
		message?: unknown;
		sources?: unknown;
		status?: unknown;
	};

	const health = parseWithSchema(
		RuntimeHealthSchema,
		record.health ?? {
			backendReachable: true,
			message: typeof record.message === 'string' ? record.message : undefined,
			status: typeof record.status === 'string' ? record.status : 'ready',
		},
		'Invalid runtime health payload.',
	);

	const sources = Array.isArray(record.sources)
		? record.sources.map((entry) =>
				parseWithSchema(
					SourceStatusSchema,
					entry,
					'Invalid source status payload.',
				),
			)
		: [];

	return { health, sources };
}

function createSearchFallbackArtifact(
	artifactId: string,
	payload: unknown,
): MemoryArtifact {
	if (Array.isArray(payload) && payload.length > 0) {
		const [first] = payload;
		if (first && typeof first === 'object') {
			const candidate = first as Partial<MemoryArtifact> & {
				content?: string;
				snippet?: string;
			};

			return parseWithSchema(
				MemoryArtifactSchema,
				{
					artifactId,
					classification: candidate.classification ?? 'artifact',
					content: candidate.content ?? candidate.snippet ?? '',
					source: candidate.source ?? 'mempalace-mcp',
					sourcePath: candidate.sourcePath ?? artifactId,
					sourceType: candidate.sourceType ?? 'mcp',
					updatedAt: candidate.updatedAt ?? new Date().toISOString(),
				},
				'Unable to reconstruct artifact from fallback search payload.',
			);
		}
	}

	throw new ArtifactNotFoundError(artifactId);
}

export class SyncDaemonMemPalaceClient
	implements MemPalaceKnowledgeGraphClient
{
	private readonly connection: StdioMcpConnection;

	public constructor(config: MemoryBackendConfig) {
		this.connection = new StdioMcpConnection(config);
	}

	public async close(): Promise<void> {
		await this.connection.close();
	}

	public async capabilities(): Promise<Set<string>> {
		return this.connection.listTools();
	}

	public async get(artifactId: string): Promise<MemoryArtifact> {
		try {
			const tools = await this.connection.listTools();
			if (tools.has('mempalace_get_drawer')) {
				const payload = await callTool(
					this.connection,
					'mempalace_get_drawer',
					{
						artifactId,
					},
				);
				return normalizeArtifact(payload, artifactId);
			}

			const searchPayload = await callTool(
				this.connection,
				'mempalace_search',
				{
					limit: 1,
					query: artifactId,
				},
			);
			return createSearchFallbackArtifact(artifactId, searchPayload);
		} catch (error) {
			if (error instanceof ArtifactNotFoundError) {
				throw error;
			}
			throw buildTransportError(
				`Failed to load artifact ${artifactId} from MemPalace MCP.`,
				{
					cause: error,
				},
			);
		}
	}

	public async getHealth(): Promise<RuntimeHealth> {
		try {
			return normalizeStatusPayload(
				await callTool(this.connection, 'mempalace_status', {}),
			).health;
		} catch (error) {
			throw buildTransportError('Failed to retrieve MemPalace health.', {
				cause: error,
			});
		}
	}

	public async listSourcesStatus(): Promise<SourceStatus[]> {
		try {
			return normalizeStatusPayload(
				await callTool(this.connection, 'mempalace_status', {}),
			).sources;
		} catch (error) {
			throw buildTransportError('Failed to retrieve MemPalace source status.', {
				cause: error,
			});
		}
	}

	public async promote(input: MemoryPromoteInput): Promise<MemoryArtifact> {
		try {
			const payload = await callTool(
				this.connection,
				'mempalace_add_drawer',
				input as Record<string, unknown>,
			);
			return normalizeArtifact(
				payload,
				input.artifactId ?? 'promoted-artifact',
			);
		} catch (error) {
			throw buildTransportError('Failed to promote memory into MemPalace.', {
				cause: error,
			});
		}
	}

	public async refreshIndex(
		request: MemoryIndexRequest,
	): Promise<MemPalaceRefreshResult> {
		try {
			const tools = await this.connection.listTools();
			if (tools.has('mempalace_refresh_index')) {
				const payload = await callTool(
					this.connection,
					'mempalace_refresh_index',
					request as Record<string, unknown>,
				);
				if (
					payload &&
					typeof payload === 'object' &&
					'accepted' in (payload as { accepted?: unknown })
				) {
					return payload as MemPalaceRefreshResult;
				}
			}

			await callTool(this.connection, 'mempalace_status', {
				refreshReason: request.reason,
			});
			return {
				accepted: true,
				...(request.force !== undefined ? { force: request.force } : {}),
				reason: request.reason,
				...(request.sourceId ? { sourceId: request.sourceId } : {}),
				...(request.target ? { target: request.target } : {}),
			};
		} catch (error) {
			throw buildTransportError(
				'Failed to refresh MemPalace runtime metadata.',
				{
					cause: error,
				},
			);
		}
	}

	public async search(query: MemorySearchQuery): Promise<MemorySearchResult[]> {
		try {
			const payload = await callTool(this.connection, 'mempalace_search', {
				classifications: query.filters?.classifications,
				hall: query.filters?.hall,
				limit: query.limit,
				memoryTypes: query.filters?.memoryTypes,
				query: query.query,
				recency: query.filters?.recency,
				room: query.filters?.room,
				sourceId: query.filters?.sourceId,
				tokenBudget: query.tokenBudget,
				wing: query.filters?.wing,
			});
			return normalizeSearchResults(payload);
		} catch (error) {
			throw buildTransportError('Failed to search MemPalace MCP.', {
				cause: error,
			});
		}
	}

	public async expandQuery(): Promise<never> {
		throw new BackendUnavailableError(
			'sync-daemon does not use graph query expansion.',
		);
	}

	public async upsertGraph(
		input: KnowledgeGraphUpsertInput,
	): Promise<{ accepted: true; entityCount: number; relationCount: number }> {
		const payload = await callTool(
			this.connection,
			'mempalace_graph_upsert',
			input,
		);
		if (
			payload &&
			typeof payload === 'object' &&
			(payload as { accepted?: unknown }).accepted === true
		) {
			return {
				accepted: true,
				entityCount:
					typeof (payload as { entityCount?: unknown }).entityCount === 'number'
						? (payload as { entityCount: number }).entityCount
						: input.entities.length,
				relationCount:
					typeof (payload as { relationCount?: unknown }).relationCount ===
					'number'
						? (payload as { relationCount: number }).relationCount
						: input.relations.length,
			};
		}
		return {
			accepted: true,
			entityCount: input.entities.length,
			relationCount: input.relations.length,
		};
	}
}
