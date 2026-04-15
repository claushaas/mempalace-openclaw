import { describe, expect, it } from 'vitest';
import type { MemPalaceClient } from './index.js';
import * as shared from './index.js';

describe('package exports', () => {
	it('exposes the public package root surface', () => {
		const typedClient: MemPalaceClient | null = null;

		expect(typedClient).toBeNull();
		expect(shared).toMatchObject({
			ContextInjectionEntrySchema: expect.anything(),
			createFingerprint: expect.any(Function),
			createProvenance: expect.any(Function),
			createVersionedHookEnvelope: expect.any(Function),
			MemoryArtifactSchema: expect.anything(),
			MemoryIndexRequestSchema: expect.anything(),
			MemoryPromoteInputSchema: expect.anything(),
			MemorySearchQuerySchema: expect.anything(),
			MemorySearchResultSchema: expect.anything(),
			MemoryStatusSchema: expect.anything(),
			parseWithSchema: expect.any(Function),
			RuntimeHealthSchema: expect.anything(),
			SourceConfigSchema: expect.anything(),
			stableStringify: expect.any(Function),
		});
	});
});
