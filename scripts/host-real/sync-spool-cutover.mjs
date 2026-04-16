import path from 'node:path';

import { RESULTS_DIR, writeJson } from './shared.mjs';
import { runSpoolCutoverScenario } from './stage6-scenarios.mjs';

const report = await runSpoolCutoverScenario();
writeJson(path.join(RESULTS_DIR, 'host-real-sync-spool-cutover.json'), report);
console.log(JSON.stringify(report, null, 2));
