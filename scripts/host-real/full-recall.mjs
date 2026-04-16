import path from 'node:path';

import { RESULTS_DIR, writeJson } from './shared.mjs';
import { runModeScenario } from './context-engine-scenarios.mjs';

const report = await runModeScenario({
	mode: 'full',
	name: 'host-real:full-recall',
	requireRecall: true,
});

writeJson(path.join(RESULTS_DIR, 'host-real-full-recall.json'), report);
console.log(JSON.stringify(report, null, 2));
