import { describe, expect, it } from 'vitest';

import { buildCommandSpecs, parseDevArgs } from './dev.ts';

describe('dev script helpers', () => {
	it('defaults to runtime mode', () => {
		expect(parseDevArgs([])).toEqual({
			mode: 'runtime',
			passthrough: [],
		});
	});

	it('parses daemon passthrough after double dash', () => {
		expect(parseDevArgs(['daemon', '--', 'run', '--once'])).toEqual({
			mode: 'daemon',
			passthrough: ['run', '--once'],
		});
	});

	it('builds runtime watch commands for all relevant packages', () => {
		const specs = buildCommandSpecs('runtime');

		expect(specs).toHaveLength(5);
		expect(specs[0]).toMatchObject({
			command: 'pnpm',
		});
		expect(specs.every((spec) => spec.args.includes('--watch'))).toBe(true);
	});

	it('builds a daemon watch command with passthrough args', () => {
		const specs = buildCommandSpecs('daemon', ['run', '--once']);

		expect(specs).toEqual([
			expect.objectContaining({
				args: [
					'exec',
					'tsx',
					'watch',
					'packages/sync-daemon/src/bin.ts',
					'run',
					'--once',
				],
				command: 'pnpm',
				label: 'daemon',
			}),
		]);
	});
});
