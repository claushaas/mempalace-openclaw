import fs from 'node:fs';
import path from 'node:path';

import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';

const PROBE_ID = 'probe-memory-slot';

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

const manager = {
	async close() {
		appendEvidence('manager.close');
	},
	async probeEmbeddingAvailability() {
		appendEvidence('manager.probeEmbeddingAvailability');
		return { ok: true };
	},
	async probeVectorAvailability() {
		appendEvidence('manager.probeVectorAvailability');
		return false;
	},
	async readFile(params) {
		appendEvidence('manager.readFile', params);
		return {
			path: params.relPath,
			text: [
				'# probe-memory-slot',
				'This file exists only for host-real seam validation.',
				`relPath=${params.relPath}`,
			].join('\n'),
		};
	},
	async search(query, opts = {}) {
		appendEvidence('manager.search', {
			maxResults: opts.maxResults,
			minScore: opts.minScore,
			purpose: opts.purpose,
			query,
			sessionKey: opts.sessionKey,
		});

		return [
			{
				citation: 'probe-memory-slot.md:1',
				endLine: 3,
				path: 'probe-memory-slot.md',
				score: 1,
				snippet: `probe-memory-slot recalled query="${query}"`,
				source: 'memory',
				startLine: 1,
			},
		];
	},
	status() {
		appendEvidence('manager.status');
		return {
			backend: 'builtin',
			chunks: 1,
			custom: {
				hostRealValidation: true,
				probeId: PROBE_ID,
			},
			files: 1,
			provider: 'probe-memory-slot',
		};
	},
	async sync(params = {}) {
		appendEvidence('manager.sync', params);
	},
};

export default definePluginEntry({
	configSchema: {
		additionalProperties: false,
		properties: {},
		type: 'object',
	},
	description: 'Host-real validation probe for the OpenClaw memory slot seam.',
	id: PROBE_ID,
	kind: 'memory',
	name: 'Probe Memory Slot',
	register(api) {
		appendEvidence('register', {
			registrationMode: api.registrationMode,
		});

		api.registerMemoryCapability({
			promptBuilder() {
				appendEvidence('capability.promptBuilder');
				return ['Probe memory slot prompt section active.'];
			},
			runtime: {
				async closeAllMemorySearchManagers() {
					appendEvidence('capability.runtime.closeAllMemorySearchManagers');
				},
				async getMemorySearchManager(params) {
					appendEvidence('capability.runtime.getMemorySearchManager', {
						agentId: params.agentId,
						purpose: params.purpose,
					});
					return { manager };
				},
				resolveMemoryBackendConfig(params) {
					appendEvidence('capability.runtime.resolveMemoryBackendConfig', {
						agentId: params.agentId,
					});
					return { backend: 'builtin' };
				},
			},
		});
	},
});
