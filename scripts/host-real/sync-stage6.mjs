import path from 'node:path';

import { RESULTS_DIR, writeJson } from './shared.mjs';
import {
	runSkillPluginScenario,
	runSourceScenario,
	runSpoolCutoverScenario,
} from './stage6-scenarios.mjs';

const reports = [
	{
		command: 'host-real:skill-mempalace-sync',
		output: await runSkillPluginScenario(),
	},
	{
		command: 'host-real:sync-filesystem',
		output: await runSourceScenario('filesystem'),
	},
	{
		command: 'host-real:sync-git',
		output: await runSourceScenario('git'),
	},
	{
		command: 'host-real:sync-spool-cutover',
		output: await runSpoolCutoverScenario(),
	},
];

const report = {
	name: 'host-real:sync-stage6',
	openclawVersion: '2026.4.14',
	recordedAt: new Date().toISOString(),
	reports,
	statusClassification: reports.every((entry) => entry.output.statusClassification === 'validated')
		? 'validated'
		: 'blocked',
};

writeJson(path.join(RESULTS_DIR, 'host-real-sync-stage6.json'), report);
console.log(JSON.stringify(report, null, 2));
