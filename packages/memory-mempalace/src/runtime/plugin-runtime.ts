import { BackendUnavailableError } from '@mempalace-openclaw/shared';

import type { MemoryPluginRuntime } from 'openclaw/plugin-sdk/memory-host-core';
import type { OpenClawConfig } from 'openclaw/plugin-sdk/plugin-entry';
import { McpStdioMemPalaceClient } from '../client/mcp-stdio-client.js';
import {
	getMemoryMempalacePluginConfigFingerprint,
	parseMemoryMempalacePluginConfig,
	type ResolvedMemoryMempalacePluginConfig,
} from '../config.js';
import { appendHostRealEvidence } from './evidence.js';
import type { MemoryPublicArtifactStore } from './public-artifacts.js';
import { MemPalaceMemorySearchManager } from './search-manager.js';
import { MemoryRuntimeService } from './service.js';

type ManagerRecord = {
	configFingerprint: string;
	manager: MemPalaceMemorySearchManager;
};

function getPluginConfig(cfg: OpenClawConfig): unknown {
	return cfg.plugins?.entries?.['memory-mempalace']?.config ?? {};
}

export class MemoryPluginRuntimeAdapter implements MemoryPluginRuntime {
	private readonly managers = new Map<string, ManagerRecord>();

	public constructor(
		private readonly artifactStore: MemoryPublicArtifactStore,
	) {}

	public async closeAllMemorySearchManagers(): Promise<void> {
		appendHostRealEvidence('capability.runtime.closeAllMemorySearchManagers');
		for (const record of this.managers.values()) {
			await record.manager.close();
		}
		this.managers.clear();
	}

	public async getMemorySearchManager(params: {
		agentId: string;
		cfg: OpenClawConfig;
		purpose?: 'default' | 'status';
	}): Promise<{
		error?: string;
		manager: MemPalaceMemorySearchManager | null;
	}> {
		appendHostRealEvidence('capability.runtime.getMemorySearchManager', {
			agentId: params.agentId,
			purpose: params.purpose,
		});

		let config: ResolvedMemoryMempalacePluginConfig;
		try {
			config = parseMemoryMempalacePluginConfig(getPluginConfig(params.cfg), {
				allowEmpty: false,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				error: message,
				manager: null,
			};
		}

		const key = `${params.agentId}:${params.purpose ?? 'default'}`;
		const configFingerprint = getMemoryMempalacePluginConfigFingerprint(config);
		const existing = this.managers.get(key);
		if (existing && existing.configFingerprint === configFingerprint) {
			return {
				manager: existing.manager,
			};
		}
		if (existing) {
			await existing.manager.close();
			this.managers.delete(key);
		}

		try {
			const client = new McpStdioMemPalaceClient(config);
			const service = new MemoryRuntimeService(client, {
				advanced: config.advanced,
				agentId: params.agentId,
				onArtifactRecorded: (artifact) => {
					this.artifactStore.writeArtifact(artifact);
				},
			});
			const initialStatus = await service.status();
			const manager = new MemPalaceMemorySearchManager(service, initialStatus);
			this.managers.set(key, {
				configFingerprint,
				manager,
			});
			return {
				manager,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				error: message,
				manager: null,
			};
		}
	}

	public resolveMemoryBackendConfig(_params: {
		agentId: string;
		cfg: OpenClawConfig;
	}): { backend: 'builtin' } {
		appendHostRealEvidence('capability.runtime.resolveMemoryBackendConfig', {});
		return { backend: 'builtin' };
	}
}

export function createMemoryRuntimeAdapter(): MemoryPluginRuntimeAdapter {
	throw new Error(
		'createMemoryRuntimeAdapter now requires a MemoryPublicArtifactStore.',
	);
}

export function createMemoryRuntimeAdapterWithArtifactStore(
	artifactStore: MemoryPublicArtifactStore,
): MemoryPluginRuntimeAdapter {
	return new MemoryPluginRuntimeAdapter(artifactStore);
}

export function createUnavailableRuntimeError(
	error: unknown,
): BackendUnavailableError {
	return new BackendUnavailableError(
		'MemPalace runtime is unavailable.',
		error,
	);
}
