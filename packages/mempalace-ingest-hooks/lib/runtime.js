import { spawn } from 'node:child_process';

import { appendHookPackEvidence } from './evidence.js';
import { resolveProcessorEntryPath } from './paths.js';

export function spawnProcessor(cfg) {
	const child = spawn(process.execPath, [resolveProcessorEntryPath()], {
		detached: true,
		env: {
			...process.env,
			MEMPALACE_OPENCLAW_CFG: JSON.stringify(cfg ?? {}),
		},
		stdio: 'ignore',
	});
	child.unref();
	appendHookPackEvidence('processor.spawned', {
		pid: child.pid,
	});
}
