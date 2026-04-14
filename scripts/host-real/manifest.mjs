import path from 'node:path';

import {
	CONTEXT_PROBE_DIR,
	CONTEXT_PROBE_ID,
	MEMORY_PROBE_DIR,
	MEMORY_PROBE_ID,
	RESULTS_DIR,
	bootstrapHostEnvironment,
	buildBaseReport,
	ensureProbeInstalled,
	inspectPlugin,
	readProbeEvidence,
	validateConfig,
	writeJson
} from './shared.mjs';

bootstrapHostEnvironment();
ensureProbeInstalled(MEMORY_PROBE_DIR);
ensureProbeInstalled(CONTEXT_PROBE_DIR);

const memoryPlugin = inspectPlugin(MEMORY_PROBE_ID);
const contextPlugin = inspectPlugin(CONTEXT_PROBE_ID);
const configValidation = validateConfig();

const report = buildBaseReport('host-real:manifest', {
	configValidation,
	contextEvidence: readProbeEvidence(CONTEXT_PROBE_ID),
	contextPlugin,
	memoryEvidence: readProbeEvidence(MEMORY_PROBE_ID),
	memoryPlugin,
	status: configValidation.valid ? 'validated' : 'blocked'
});

const outputPath = path.join(RESULTS_DIR, 'host-real-manifest.json');
writeJson(outputPath, report);
console.log(JSON.stringify(report, null, 2));
