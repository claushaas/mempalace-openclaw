import { describe, expect, it } from 'vitest';

describe('spawnProcessor', () => {
	it('can be imported without throwing', async () => {
		const runtime = await import('./runtime.js');
		expect(runtime.spawnProcessor).toEqual(expect.any(Function));
	});
});
