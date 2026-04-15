import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';

import { memoryMempalacePluginConfigSchema } from './config.js';
import { appendHostRealEvidence } from './runtime/evidence.js';
import { createMemoryRuntimeAdapter } from './runtime/plugin-runtime.js';

const runtime = createMemoryRuntimeAdapter();

export default definePluginEntry({
	configSchema: memoryMempalacePluginConfigSchema,
	description:
		'MemPalace-backed replacement runtime for the OpenClaw memory slot.',
	id: 'memory-mempalace',
	kind: 'memory',
	name: 'MemPalace Memory Runtime',
	register(api) {
		appendHostRealEvidence('register', {
			registrationMode: api.registrationMode,
		});

		api.registerMemoryCapability({
			promptBuilder() {
				appendHostRealEvidence('capability.promptBuilder');
				return [
					'MemPalace-backed memory runtime is active.',
					'Use the memory runtime as the durable source of truth for long-term recall.',
				];
			},
			runtime,
		});
	},
});
