import path from 'node:path';

import { RESULTS_DIR, writeJson } from './shared.mjs';
import { runSourceScenario } from './stage6-scenarios.mjs';

const report = await runSourceScenario('git');
writeJson(path.join(RESULTS_DIR, 'host-real-sync-git.json'), report);
console.log(JSON.stringify(report, null, 2));
