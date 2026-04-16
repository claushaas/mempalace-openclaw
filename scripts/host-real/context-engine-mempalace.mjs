import path from 'node:path';

import {
	CONTEXT_ENGINE_MEMPALACE_DIR,
	CONTEXT_ENGINE_MEMPALACE_ID,
	MEMORY_MEMPALACE_DIR,
	MEMORY_MEMPALACE_ID,
	MEMPALACE_MCP_SHIM_PATH,
	RESULTS_DIR,
	bootstrapHostEnvironment,
	buildBaseReport,
	buildMemoryPluginConfig,
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
await withTemporarilyDetachedNodeModules(
	CONTEXT_ENGINE_MEMPALACE_DIR,
	async () => {
		ensureLinkedPluginInstalled(CONTEXT_ENGINE_MEMPALACE_DIR);
	},
);

updateHostConfig((config) => {
	config.plugins ??= {};
	config.plugins.entries ??= {};
	config.plugins.entries[MEMORY_MEMPALACE_ID] = {
		config: buildMemoryPluginConfig(),
		enabled: true,
	};
	config.plugins.entries[CONTEXT_ENGINE_MEMPALACE_ID] = {
		config: {
			includeMemoryPromptAddition: true,
			maxArtifactLines: 40,
			maxContextTokens: 1200,
			maxEntries: 6,
			minScore: 0.15,
		},
		enabled: true,
	};
	config.plugins.slots ??= {};
	config.plugins.slots.memory = MEMORY_MEMPALACE_ID;
	config.plugins.slots.contextEngine = CONTEXT_ENGINE_MEMPALACE_ID;
	return config;
});

const configValidation = validateConfig();
const memoryPlugin = inspectPlugin(MEMORY_MEMPALACE_ID);
const plugin = inspectPlugin(CONTEXT_ENGINE_MEMPALACE_ID);
const gatewayProbe = runGatewayProbe();
const evidence = readProbeEvidence(CONTEXT_ENGINE_MEMPALACE_ID);

const report = buildBaseReport('host-real:context-engine-mempalace', {
	configValidation,
	evidence,
	gatewayProbe,
	memoryPlugin,
	packageDir: CONTEXT_ENGINE_MEMPALACE_DIR,
	plugin,
	shimPath: MEMPALACE_MCP_SHIM_PATH,
	statusClassification:
		configValidation.valid &&
		plugin.plugin?.contextEngineIds?.includes(CONTEXT_ENGINE_MEMPALACE_ID)
			? 'validated'
			: 'blocked',
	statusNotes: [
		'Este harness valida o package final claw-context-mempalace no slot contextEngine.',
		'Ele prova slot loading real e bootstrap do gateway; a prova de recall fica nos harnesses dedicados de modo operacional.',
	],
});

const outputPath = path.join(
	RESULTS_DIR,
	'host-real-context-engine-mempalace.json',
);
writeJson(outputPath, report);
console.log(JSON.stringify(report, null, 2));
