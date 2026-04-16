import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';

import { memoryMempalacePluginConfigSchema } from './config.js';
import { appendHostRealEvidence } from './runtime/evidence.js';
import { createMemoryRuntimeAdapterWithArtifactStore } from './runtime/plugin-runtime.js';
import { MemoryPublicArtifactStore } from './runtime/public-artifacts.js';

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
		const artifactStore = new MemoryPublicArtifactStore(
			api.runtime.state.resolveStateDir(),
		);
		const runtime = createMemoryRuntimeAdapterWithArtifactStore(artifactStore);

		api.registerMemoryCapability({
			promptBuilder() {
				appendHostRealEvidence('capability.promptBuilder');
				return [
					'MemPalace-backed memory runtime is active.',
					'Use the memory runtime as the durable source of truth for long-term recall.',
				];
			},
			publicArtifacts: {
				async listArtifacts(params) {
					const artifacts = await artifactStore.listArtifacts(params);
					appendHostRealEvidence('capability.publicArtifacts.listArtifacts', {
						count: artifacts.length,
						relativePaths: artifacts.map((artifact) => artifact.relativePath),
					});
					return artifacts;
				},
			},
			runtime,
		});
	},
});
