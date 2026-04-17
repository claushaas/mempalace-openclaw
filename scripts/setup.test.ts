import { describe, expect, it } from 'vitest';

import {
	compareVersions,
	formatNextSteps,
	parseVersion,
	satisfiesSupportedRange,
	validateEnvironment,
} from './setup.mjs';

describe('setup helpers', () => {
	it('parses semantic versions with or without leading v', () => {
		expect(parseVersion('24.13.1')).toEqual([24, 13, 1]);
		expect(parseVersion('v10.33.0')).toEqual([10, 33, 0]);
	});

	it('compares versions lexicographically', () => {
		expect(compareVersions([24, 13, 1], [24, 13, 1])).toBe(0);
		expect(compareVersions([24, 13, 2], [24, 13, 1])).toBeGreaterThan(0);
		expect(compareVersions([24, 12, 9], [24, 13, 1])).toBeLessThan(0);
	});

	it('evaluates engine ranges from package.json', () => {
		expect(satisfiesSupportedRange('24.13.1', '>=24.13.1 <25')).toBe(true);
		expect(satisfiesSupportedRange('25.0.0', '>=24.13.1 <25')).toBe(false);
	});

	it('reports invalid environments with objective messages', () => {
		const result = validateEnvironment(
			{
				SETUP_NODE_VERSION: 'v23.0.0',
				SETUP_PNPM_VERSION: '10.0.0',
			},
			{
				node: '>=24.13.1 <25',
				pnpm: '>=10.33.0 <11',
			},
		);

		expect(result.ok).toBe(false);
		expect(result.issues).toHaveLength(2);
	});

	it('formats next steps consistently', () => {
		expect(formatNextSteps(false)).toContain('pnpm smoke:examples');
		expect(formatNextSteps(true)).toContain('host-real bootstrap was executed');
	});
});
