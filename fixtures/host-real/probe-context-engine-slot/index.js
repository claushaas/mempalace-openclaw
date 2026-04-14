import fs from 'node:fs';
import path from 'node:path';

import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';

const PROBE_ID = 'probe-context-engine-slot';

function appendEvidence(event, payload = {}) {
	const resultsDir = process.env.OPENCLAW_HOST_REAL_RESULTS_DIR;
	if (!resultsDir) {
		return;
	}

	fs.mkdirSync(resultsDir, { recursive: true });
	const file = path.join(resultsDir, `${PROBE_ID}.jsonl`);
	const record = {
		event,
		payload,
		probeId: PROBE_ID,
		recordedAt: new Date().toISOString(),
	};
	fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
}

function createEngine() {
	appendEvidence('engine.create');

	return {
		async assemble(params) {
			appendEvidence('engine.assemble', {
				availableTools: params.availableTools ? [...params.availableTools] : [],
				messageCount: params.messages.length,
				model: params.model,
				prompt: params.prompt,
				sessionId: params.sessionId,
				sessionKey: params.sessionKey,
				tokenBudget: params.tokenBudget,
			});
			return {
				estimatedTokens: 0,
				messages: params.messages,
				systemPromptAddition: '[probe-context-engine-slot active]',
			};
		},
		async bootstrap(params) {
			appendEvidence('engine.bootstrap', {
				sessionId: params.sessionId,
				sessionKey: params.sessionKey,
			});
			return {
				bootstrapped: true,
				importedMessages: 0,
			};
		},
		async compact(params) {
			appendEvidence('engine.compact', {
				force: params.force,
				sessionId: params.sessionId,
				sessionKey: params.sessionKey,
				tokenBudget: params.tokenBudget,
			});
			return {
				compacted: false,
				ok: true,
				reason: 'probe-noop',
			};
		},
		async dispose() {
			appendEvidence('engine.dispose');
		},
		info: {
			id: PROBE_ID,
			name: 'Probe Context Engine Slot',
			ownsCompaction: false,
			version: '0.0.0-host-real-probe',
		},
		async ingest(params) {
			appendEvidence('engine.ingest', {
				isHeartbeat: params.isHeartbeat,
				sessionId: params.sessionId,
				sessionKey: params.sessionKey,
			});
			return { ingested: true };
		},
	};
}

export default definePluginEntry({
	configSchema: {
		additionalProperties: false,
		properties: {},
		type: 'object',
	},
	description:
		'Host-real validation probe for the OpenClaw context engine slot seam.',
	id: PROBE_ID,
	kind: 'context-engine',
	name: 'Probe Context Engine Slot',
	register(api) {
		appendEvidence('register', {
			registrationMode: api.registrationMode,
		});
		api.registerContextEngine(PROBE_ID, () => createEngine());
	},
});
