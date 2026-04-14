import { spawnSync } from 'node:child_process';

const steps = [
	'bootstrap',
	'manifest',
	'memory-slot',
	'context-slot',
	'active-memory'
];

for (const step of steps) {
	const result = spawnSync('node', [`./scripts/host-real/${step}.mjs`], {
		cwd: process.cwd(),
		encoding: 'utf8',
		stdio: 'inherit'
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}
