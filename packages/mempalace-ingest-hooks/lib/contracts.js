import { createHash } from 'node:crypto';

function isPlainObject(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeJson(value) {
	if (Array.isArray(value)) {
		return value.map((entry) => normalizeJson(entry));
	}
	if (isPlainObject(value)) {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, normalizeJson(entry)]),
		);
	}
	return value;
}

export function stableStringify(value) {
	return JSON.stringify(normalizeJson(value));
}

export function createFingerprint(value) {
	return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function createVersionedHookEnvelope(input) {
	const requiredKeys = [
		'agentId',
		'event',
		'idempotencyKey',
		'sessionId',
		'timestamp',
	];
	for (const key of requiredKeys) {
		if (typeof input?.[key] !== 'string' || input[key].trim().length === 0) {
			throw new Error(`Invalid hook envelope field: ${key}`);
		}
	}
	return {
		agentId: input.agentId,
		event: input.event,
		idempotencyKey: input.idempotencyKey,
		payload: input.payload ?? {},
		sessionId: input.sessionId,
		timestamp: input.timestamp,
		version: 'v1',
	};
}

export function assertHookEnvelope(input) {
	return createVersionedHookEnvelope(input);
}

export function assertPromoteInput(input, message = 'Invalid promote input.') {
	if (
		typeof input?.classification !== 'string' ||
		input.classification.length === 0
	) {
		throw new Error(message);
	}
	if (typeof input?.memoryType !== 'string' || input.memoryType.length === 0) {
		throw new Error(message);
	}
	if (typeof input?.source !== 'string' || input.source.length === 0) {
		throw new Error(message);
	}
	if (
		(typeof input?.artifactId !== 'string' || input.artifactId.length === 0) &&
		(typeof input?.content !== 'string' || input.content.length === 0)
	) {
		throw new Error(message);
	}
	return input;
}
