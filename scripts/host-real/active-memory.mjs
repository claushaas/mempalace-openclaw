import path from 'node:path';

import {
	RESULTS_DIR,
	bootstrapHostEnvironment,
	buildBaseReport,
	inspectPlugin,
	runGatewayProbe,
	updateHostConfig,
	validateConfig,
	writeJson
} from './shared.mjs';

bootstrapHostEnvironment();

updateHostConfig((config) => {
	config.plugins ??= {};
	config.plugins.entries ??= {};
	config.plugins.entries['active-memory'] = {
		enabled: true,
		config: {
			agents: ['main'],
			allowedChatTypes: ['direct'],
			enabled: true,
			logging: true,
			maxSummaryChars: 220,
			modelFallback: 'google/gemini-3-flash',
			persistTranscripts: false,
			promptStyle: 'balanced',
			queryMode: 'recent',
			timeoutMs: 15000
		}
	};
	return config;
});

const configValidation = validateConfig();
const plugin = inspectPlugin('active-memory');
const gatewayProbe = runGatewayProbe();

const report = buildBaseReport('host-real:active-memory', {
	configValidation,
	gatewayProbe,
	observedConfigPath: 'plugins.entries.active-memory',
	plugin,
	statusClassification: configValidation.valid ? 'partially_validated' : 'blocked',
	statusReason:
		'The target version accepts the active-memory config surface and exposes the bundled plugin, but this stage still does not prove a full blocking pre-reply pass.'
});

const outputPath = path.join(RESULTS_DIR, 'host-real-active-memory.json');
writeJson(outputPath, report);
console.log(JSON.stringify(report, null, 2));
