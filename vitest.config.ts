import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			'@mempalace-openclaw/shared': path.resolve(
				__dirname,
				'packages/shared/src/index.ts',
			),
			'@mempalace-openclaw/sync-daemon': path.resolve(
				__dirname,
				'packages/sync-daemon/src/index.ts',
			),
		},
	},
	test: {
		include: ['packages/**/*.test.ts'],
	},
});
