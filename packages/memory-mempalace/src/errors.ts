export class MemoryRuntimeConfigurationError extends Error {
	public constructor(message: string, options?: { cause?: unknown }) {
		super(message, { cause: options?.cause });
		this.name = 'MemoryRuntimeConfigurationError';
	}
}

export class McpProtocolError extends Error {
	public constructor(message: string, options?: { cause?: unknown }) {
		super(message, { cause: options?.cause });
		this.name = 'McpProtocolError';
	}
}

export class McpToolNotFoundError extends Error {
	public readonly toolName: string;

	public constructor(
		toolName: string,
		message?: string,
		options?: { cause?: unknown },
	) {
		super(message ?? `MCP tool not found: ${toolName}`, {
			cause: options?.cause,
		});
		this.name = 'McpToolNotFoundError';
		this.toolName = toolName;
	}
}
