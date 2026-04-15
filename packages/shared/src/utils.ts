import type { z } from 'zod';

import { SchemaValidationError } from './errors.js';
import {
	type HookEnvelope,
	HookEnvelopeSchema,
	type Provenance,
	ProvenanceSchema,
	type SessionClassification,
} from './schemas.js';

export function createVersionedHookEnvelope(
	input: Omit<HookEnvelope, 'version'> & { version?: 'v1' },
): HookEnvelope {
	return HookEnvelopeSchema.parse({
		...input,
		version: 'v1',
	});
}

export function createProvenance(input: {
	classification: SessionClassification;
	source: string;
	sourcePath: string;
	sourceType: string;
	updatedAt: string;
}): Provenance {
	return ProvenanceSchema.parse(input);
}

export function parseWithSchema<TSchema extends z.ZodTypeAny>(
	schema: TSchema,
	input: unknown,
	message: string,
): z.infer<TSchema> {
	const parsed = schema.safeParse(input);

	if (!parsed.success) {
		throw new SchemaValidationError(message, parsed.error.issues, parsed.error);
	}

	return parsed.data;
}
