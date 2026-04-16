import path from 'node:path';

import { RESULTS_DIR, writeJson } from './shared.mjs';
import { runSkillPluginScenario } from './stage6-scenarios.mjs';

const report = await runSkillPluginScenario();
writeJson(path.join(RESULTS_DIR, 'host-real-skill-mempalace-sync.json'), report);
console.log(JSON.stringify(report, null, 2));
