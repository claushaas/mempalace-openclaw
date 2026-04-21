import path from 'node:path';

import {
	MEMORY_MEMPALACE_DIR,
	MEMORY_MEMPALACE_ID,
	MEMPALACE_MCP_SHIM_PATH,
	RESULTS_DIR,
	bootstrapHostEnvironment,
	buildBaseReport,
	ensureLinkedPluginInstalled,
	inspectPlugin,
	readProbeEvidence,
	runCommand,
	runGatewayProbe,
	updateHostConfig,
	validateConfig,
	withTemporarilyDetachedNodeModules,
	writeJson,
} from './shared.mjs';

bootstrapHostEnvironment();
runCommand('pnpm', ['build']);
await withTemporarilyDetachedNodeModules(MEMORY_MEMPALACE_DIR, async () => {
	ensureLinkedPluginInstalled(MEMORY_MEMPALACE_DIR);
});

updateHostConfig((config) => {
	config.plugins ??= {};
	config.plugins.entries ??= {};
	config.plugins.entries[MEMORY_MEMPALACE_ID] = {
		enabled: true,
		config: {
			args: [MEMPALACE_MCP_SHIM_PATH],
			command: process.execPath,
			defaultResultLimit: 8,
			defaultTokenBudget: 1200,
			timeoutMs: 5000,
			transport: 'stdio',
		},
	};
	config.plugins.slots ??= {};
	config.plugins.slots.memory = MEMORY_MEMPALACE_ID;
	return config;
});

const configValidation = validateConfig();
const plugin = inspectPlugin(MEMORY_MEMPALACE_ID);
const gatewayProbe = runGatewayProbe();
const evidence = readProbeEvidence(MEMORY_MEMPALACE_ID);

const report = buildBaseReport('host-real:memory-mempalace', {
	configValidation,
	evidence,
	gatewayProbe,
	packageDir: MEMORY_MEMPALACE_DIR,
	plugin,
	shimPath: MEMPALACE_MCP_SHIM_PATH,
	statusClassification:
		configValidation.valid &&
		plugin.plugin?.memorySlotSelected === true &&
		evidence.some((entry) => entry.event === 'register')
			? 'validated'
			: 'blocked',
	statusNotes: [
		'This harness validates the final memory-mempalace package, not the Etapa 0A probe.',
		'The backend seam is exercised through a local MemPalace MCP stdio shim, not a production MemPalace instance.',
		'Because openclaw@2026.4.15 disables memory-core when an external memory slot is selected, gateway bootstrap plus plugin inspection remain the canonical acceptance signals.',
	],
});

const outputPath = path.join(RESULTS_DIR, 'host-real-memory-mempalace.json');
writeJson(outputPath, report);
console.log(JSON.stringify(report, null, 2));
