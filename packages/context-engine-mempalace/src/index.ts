import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';

import {
	assertContextEngineConfigSerializable,
	contextEngineMempalacePluginConfigSchema,
	parseContextEngineMempalacePluginConfig,
} from './config.js';
import { createContextEngine } from './engine.js';
import { appendContextEngineEvidence } from './evidence.js';

export default definePluginEntry({
	configSchema: contextEngineMempalacePluginConfigSchema,
	description:
		'MemPalace-backed context engine for disciplined pre-reply recall in OpenClaw.',
	id: 'claw-context-mempalace',
	kind: 'context-engine',
	name: 'MemPalace Context Engine',
	register(api) {
		appendContextEngineEvidence('register', {
			registrationMode: api.registrationMode,
		});
		const config = parseContextEngineMempalacePluginConfig(
			api.pluginConfig ?? {},
		);
		assertContextEngineConfigSerializable(config);
		api.registerContextEngine('claw-context-mempalace', () =>
			createContextEngine(api, config),
		);
	},
});
