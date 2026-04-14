import path from 'node:path';

import {
	CONTEXT_PROBE_DIR,
	CONTEXT_PROBE_ID,
	RESULTS_DIR,
	bootstrapHostEnvironment,
	buildBaseReport,
	ensureProbeInstalled,
	inspectPlugin,
	readProbeEvidence,
	runGatewayProbe,
	updateHostConfig,
	validateConfig,
	writeJson
} from './shared.mjs';

bootstrapHostEnvironment();
ensureProbeInstalled(CONTEXT_PROBE_DIR);

updateHostConfig((config) => {
	config.plugins ??= {};
	config.plugins.entries ??= {};
	config.plugins.entries[CONTEXT_PROBE_ID] = {
		enabled: true,
		config: {}
	};
	config.plugins.slots ??= {};
	config.plugins.slots.contextEngine = CONTEXT_PROBE_ID;
	return config;
});

const configValidation = validateConfig();
const plugin = inspectPlugin(CONTEXT_PROBE_ID);
const gatewayProbe = runGatewayProbe();
const evidence = readProbeEvidence(CONTEXT_PROBE_ID);

const report = buildBaseReport('host-real:context-slot', {
	configValidation,
	evidence,
	gatewayProbe,
	plugin,
	statusClassification:
		configValidation.valid && evidence.some((entry) => entry.event === 'register') ? 'validated' : 'blocked'
});

const outputPath = path.join(RESULTS_DIR, 'host-real-context-slot.json');
writeJson(outputPath, report);
console.log(JSON.stringify(report, null, 2));
