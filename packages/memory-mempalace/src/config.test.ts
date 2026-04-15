import { describe, expect, it } from 'vitest';

import {
	getMemoryMempalacePluginConfigFingerprint,
	parseMemoryMempalacePluginConfig,
} from './config.js';

describe('memory-mempalace config', () => {
	it('parses a valid stdio MCP config', () => {
		const config = parseMemoryMempalacePluginConfig({
			args: ['-m', 'mempalace.mcp_server'],
			command: 'python3',
			defaultResultLimit: 10,
		});

		expect(config.transport).toBe('stdio');
		expect(config.command).toBe('python3');
		expect(config.defaultTokenBudget).toBe(1200);
		expect(getMemoryMempalacePluginConfigFingerprint(config)).toHaveLength(64);
	});

	it('rejects missing command outside internal empty-config mode', () => {
		expect(() => parseMemoryMempalacePluginConfig({})).toThrow();
	});
});
