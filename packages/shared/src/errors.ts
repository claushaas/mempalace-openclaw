import type { ZodIssue } from 'zod';

import type { JsonValue } from './serializable.js';

export type SharedContractErrorCode =
	| 'schema_validation_error'
	| 'source_not_found'
	| 'artifact_not_found'
	| 'backend_unavailable'
	| 'invalid_refresh_request'
	| 'invalid_promote_request';

export class SharedContractError extends Error {
	public readonly code: SharedContractErrorCode;
	public readonly details: JsonValue | undefined;

	public constructor(
		code: SharedContractErrorCode,
		message: string,
		options?: {
			cause?: unknown;
			details?: JsonValue | undefined;
		},
	) {
		super(message, { cause: options?.cause });
		this.code = code;
		this.details = options?.details;
		this.name = new.target.name;
	}
}

function serializeIssues(issues: ZodIssue[]): JsonValue {
	return {
		issues: issues.map((issue) => ({
			code: issue.code,
			message: issue.message,
			path: issue.path.map((segment) => String(segment)),
		})),
	};
}

export class SchemaValidationError extends SharedContractError {
	public constructor(message: string, issues?: ZodIssue[], cause?: unknown) {
		super('schema_validation_error', message, {
			cause,
			details: issues ? serializeIssues(issues) : undefined,
		});
	}
}

export class SourceNotFoundError extends SharedContractError {
	public constructor(sourceId: string, cause?: unknown) {
		super('source_not_found', `Source not found: ${sourceId}`, {
			cause,
			details: { sourceId },
		});
	}
}

export class ArtifactNotFoundError extends SharedContractError {
	public constructor(artifactId: string, cause?: unknown) {
		super('artifact_not_found', `Artifact not found: ${artifactId}`, {
			cause,
			details: { artifactId },
		});
	}
}

export class BackendUnavailableError extends SharedContractError {
	public constructor(
		message = 'MemPalace backend is unavailable.',
		cause?: unknown,
		details?: JsonValue | undefined,
	) {
		super('backend_unavailable', message, {
			cause,
			details,
		});
	}
}

export class InvalidRefreshRequestError extends SharedContractError {
	public constructor(
		message = 'Invalid refresh request.',
		cause?: unknown,
		details?: JsonValue | undefined,
	) {
		super('invalid_refresh_request', message, {
			cause,
			details,
		});
	}
}

export class InvalidPromoteRequestError extends SharedContractError {
	public constructor(
		message = 'Invalid promote request.',
		cause?: unknown,
		details?: JsonValue | undefined,
	) {
		super('invalid_promote_request', message, {
			cause,
			details,
		});
	}
}
