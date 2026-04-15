import { createHash } from 'node:crypto';
import { z } from 'zod';

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
	[key: string]: JsonValue;
}

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(JsonValueSchema),
		z.record(z.string(), JsonValueSchema),
	]),
);

function normalizeSerializableValue(value: JsonValue): JsonValue {
	if (Array.isArray(value)) {
		return value.map((entry) => normalizeSerializableValue(entry));
	}

	if (value && typeof value === 'object') {
		const normalizedEntries = Object.entries(value)
			.sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
			.map(
				([key, entryValue]) =>
					[key, normalizeSerializableValue(entryValue)] as const,
			);

		return Object.fromEntries(normalizedEntries);
	}

	return value;
}

export function stableStringify(value: JsonValue): string {
	return JSON.stringify(normalizeSerializableValue(value));
}

export function createFingerprint(value: JsonValue): string {
	return createHash('sha256').update(stableStringify(value)).digest('hex');
}
