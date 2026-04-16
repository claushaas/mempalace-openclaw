import { describe, expect, it } from 'vitest';

import { parseContextEngineMempalacePluginConfig } from './config.js';

describe('parseContextEngineMempalacePluginConfig', () => {
	it('applies defaults', () => {
		expect(parseContextEngineMempalacePluginConfig({})).toEqual({
			includeMemoryPromptAddition: true,
			maxArtifactLines: 40,
			maxContextTokens: 1200,
			maxEntries: 6,
			minScore: 0.15,
		});
	});

	it('rejects invalid values', () => {
		expect(() =>
			parseContextEngineMempalacePluginConfig({
				maxEntries: 0,
			}),
		).toThrow();
	});
});
