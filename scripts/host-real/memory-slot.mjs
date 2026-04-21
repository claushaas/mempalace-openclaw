import path from 'node:path';

import {
	MEMORY_PROBE_DIR,
	MEMORY_PROBE_ID,
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
ensureProbeInstalled(MEMORY_PROBE_DIR);

updateHostConfig((config) => {
	config.plugins ??= {};
	config.plugins.entries ??= {};
	config.plugins.entries[MEMORY_PROBE_ID] = {
		enabled: true,
		config: {}
	};
	config.plugins.slots ??= {};
	config.plugins.slots.memory = MEMORY_PROBE_ID;
	return config;
});

const configValidation = validateConfig();
const plugin = inspectPlugin(MEMORY_PROBE_ID);
const gatewayProbe = runGatewayProbe();
const evidence = readProbeEvidence(MEMORY_PROBE_ID);

const report = buildBaseReport('host-real:memory-slot', {
	configValidation,
	evidence,
	gatewayProbe,
	plugin,
	statusClassification:
		configValidation.valid && plugin.plugin?.memorySlotSelected === true && evidence.some((entry) => entry.event === 'register')
			? 'validated'
			: 'blocked',
	statusNotes: [
		'On openclaw@2026.4.15, selecting an external memory slot disables the bundled memory-core plugin.',
		'Because memory-core owns the root `openclaw memory` CLI tree, the harness validates slot selection through plugin inspection plus gateway bootstrap, not through the built-in memory CLI.'
	]
});

const outputPath = path.join(RESULTS_DIR, 'host-real-memory-slot.json');
writeJson(outputPath, report);
console.log(JSON.stringify(report, null, 2));
