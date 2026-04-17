import { describe, expect, it } from 'vitest';

import {
	buildValidationSummary,
	partitionExampleFiles,
} from './validate-config.ts';

describe('validate-config helpers', () => {
	it('partitions source configs and openclaw configs correctly', () => {
		const files = [
			'/repo/examples/openclaw.config.memory-only.json',
			'/repo/examples/openclaw.config.recommended.json',
			'/repo/examples/obsidian-source.json',
			'/repo/examples/repo-source.json',
			'/repo/examples/random.json',
		];

		expect(partitionExampleFiles(files)).toEqual({
			jsonFiles: files,
			openClawConfigs: [
				'/repo/examples/openclaw.config.memory-only.json',
				'/repo/examples/openclaw.config.recommended.json',
			],
			sourceConfigs: [
				'/repo/examples/obsidian-source.json',
				'/repo/examples/repo-source.json',
			],
		});
	});

	it('builds a failing summary when any validation failed', () => {
		const summary = buildValidationSummary([
			{
				file: 'examples/ok.json',
				message: 'ok',
				status: 'validated',
				type: 'json',
			},
			{
				file: 'examples/bad.json',
				message: 'bad',
				status: 'failed',
				type: 'openclaw-config',
			},
		]);

		expect(summary.ok).toBe(false);
		expect(summary.total).toBe(2);
		expect(summary.failed).toHaveLength(1);
	});
});
