import path from 'node:path';

import { RESULTS_DIR, writeJson } from './shared.mjs';
import { runSourceScenario } from './stage6-scenarios.mjs';

const report = await runSourceScenario('filesystem');
writeJson(path.join(RESULTS_DIR, 'host-real-sync-filesystem.json'), report);
console.log(JSON.stringify(report, null, 2));
