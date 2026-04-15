import { spawn } from 'node:child_process';

import { assertPromoteInput } from './contracts.js';

function coerceStructuredPayload(result) {
	if (
		result &&
		typeof result === 'object' &&
		'structuredContent' in result &&
		result.structuredContent !== undefined
	) {
		return result.structuredContent;
	}

	if (result && typeof result === 'object' && Array.isArray(result.content)) {
		const text = result.content
			.map((item) => (typeof item?.text === 'string' ? item.text : ''))
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

function buildTransportError(message, options = {}) {
	const error = new Error(message, {
		cause: options.cause,
	});
	error.name = 'BackendUnavailableError';
	if (options.stderr) {
		error.details = { stderr: options.stderr };
	}
	return error;
}

class StdioMcpConnection {
	constructor(config) {
		this.args = config.args ?? [];
		this.command = config.command;
		this.cwd = config.cwd;
		this.env = config.env;
		this.timeoutMs = config.timeoutMs ?? 5000;
		this.child = null;
		this.pending = new Map();
		this.readBuffer = '';
		this.nextId = 1;
		this.availableTools = null;
		this.stderrBuffer = '';
	}

	async close() {
		for (const entry of this.pending.values()) {
			entry.reject(new Error('MCP connection closed.'));
		}
		this.pending.clear();
		if (this.child) {
			this.child.kill();
		}
		this.child = null;
		this.availableTools = null;
	}

	async ensureStarted() {
		if (this.child) {
			return;
		}

		await new Promise((resolve, reject) => {
			const child = spawn(this.command, this.args, {
				cwd: this.cwd,
				env: {
					...process.env,
					...this.env,
				},
				stdio: 'pipe',
			});

			this.child = child;
			child.stdout.setEncoding('utf8');
			child.stderr.setEncoding('utf8');

			child.stderr.on('data', (chunk) => {
				this.stderrBuffer += chunk;
			});

			child.stdout.on('data', (chunk) => {
				this.readBuffer += chunk;
				this.flushMessages();
			});

			child.once('error', (error) => {
				reject(
					buildTransportError('Failed to start MCP stdio process.', {
						cause: error,
						stderr: this.stderrBuffer,
					}),
				);
			});

			child.once('spawn', async () => {
				try {
					await this.request('initialize', {
						capabilities: {},
						clientInfo: {
							name: 'mempalace-ingest-hooks',
							version: '0.0.0',
						},
						protocolVersion: '2025-06-18',
					});
					this.writeMessage({
						jsonrpc: '2.0',
						method: 'notifications/initialized',
					});
					resolve();
				} catch (error) {
					reject(error);
				}
			});
		});
	}

	async listTools() {
		await this.ensureStarted();
		if (this.availableTools) {
			return this.availableTools;
		}

		const payload = await this.request('tools/list', {});
		const tools = new Set();
		if (
			payload &&
			typeof payload === 'object' &&
			Array.isArray(payload.tools)
		) {
			for (const tool of payload.tools) {
				if (typeof tool?.name === 'string' && tool.name.length > 0) {
					tools.add(tool.name);
				}
			}
		}
		this.availableTools = tools;
		return tools;
	}

	async request(method, params) {
		await this.ensureStarted();
		const id = this.nextId++;
		const payload = {
			id,
			jsonrpc: '2.0',
			method,
			params,
		};

		return new Promise((resolve, reject) => {
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

			const original = this.pending.get(id);
			this.pending.set(id, {
				reject: (reason) => {
					clearTimeout(timeout);
					reject(reason);
				},
				resolve: (value) => {
					clearTimeout(timeout);
					resolve(value);
				},
			});

			if (!original) {
				return;
			}
		});
	}

	writeMessage(message) {
		if (!this.child?.stdin.writable) {
			throw buildTransportError('MCP stdin is not writable.', {
				stderr: this.stderrBuffer,
			});
		}
		const encoded = JSON.stringify(message);
		this.child.stdin.write(
			`Content-Length: ${Buffer.byteLength(encoded, 'utf8')}\r\n\r\n${encoded}`,
		);
	}

	flushMessages() {
		while (true) {
			const headerEnd = this.readBuffer.indexOf('\r\n\r\n');
			if (headerEnd === -1) {
				return;
			}

			const header = this.readBuffer.slice(0, headerEnd);
			const match = header.match(/Content-Length:\s*(\d+)/i);
			if (!match) {
				throw buildTransportError('Missing Content-Length header.', {
					stderr: this.stderrBuffer,
				});
			}
			const length = Number.parseInt(match[1], 10);
			const bodyStart = headerEnd + 4;
			const bodyEnd = bodyStart + length;
			if (this.readBuffer.length < bodyEnd) {
				return;
			}

			const body = this.readBuffer.slice(bodyStart, bodyEnd);
			this.readBuffer = this.readBuffer.slice(bodyEnd);
			const message = JSON.parse(body);
			if (message.id === undefined || message.id === null) {
				continue;
			}
			const pending = this.pending.get(message.id);
			if (!pending) {
				continue;
			}
			this.pending.delete(message.id);
			if (message.error) {
				pending.reject(
					buildTransportError(message.error.message ?? 'MCP request failed.', {
						stderr: this.stderrBuffer,
					}),
				);
				continue;
			}
			pending.resolve(message.result);
		}
	}
}

export class HookPackMemPalaceClient {
	constructor(config) {
		this.connection = new StdioMcpConnection(config);
	}

	async close() {
		await this.connection.close();
	}

	async promote(input) {
		const normalizedInput = assertPromoteInput(
			input,
			'Invalid promote payload for hook processor.',
		);
		const payload = await this.callTool(
			'mempalace_add_drawer',
			normalizedInput,
		);
		return payload;
	}

	async refreshIndex(request) {
		const payload = await this.callTool('mempalace_refresh_index', request);
		return payload;
	}

	async getStatus() {
		return this.callTool('mempalace_status', {});
	}

	async callTool(name, args) {
		const tools = await this.connection.listTools();
		if (!tools.has(name)) {
			throw buildTransportError(`MCP tool not found: ${name}`);
		}
		const result = await this.connection.request('tools/call', {
			arguments: args,
			name,
		});
		return coerceStructuredPayload(result);
	}
}
