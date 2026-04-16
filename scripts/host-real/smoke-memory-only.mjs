import path from 'node:path';

import { RESULTS_DIR, writeJson } from './shared.mjs';
import { runModeScenario } from './context-engine-scenarios.mjs';

const report = await runModeScenario({
	mode: 'memory-only',
	name: 'host-real:smoke:memory-only',
	requireRecall: false,
});

writeJson(path.join(RESULTS_DIR, 'host-real-smoke-memory-only.json'), report);
console.log(JSON.stringify(report, null, 2));
