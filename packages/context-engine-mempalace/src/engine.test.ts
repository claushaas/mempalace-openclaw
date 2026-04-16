import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createContextEngine } from './engine.js';

const tempDirs: string[] = [];

function createTempDir(): string {
	const dirPath = fs.mkdtempSync(
		path.join(os.tmpdir(), 'context-engine-mempalace-'),
	);
	tempDirs.push(dirPath);
	return dirPath;
}

function createApi(): OpenClawPluginApi {
	const stateDir = createTempDir();
	return {
		config: {},
		description: 'test',
		id: 'test',
		logger: {
			debug() {},
			error() {},
			info() {},
			warn() {},
		},
		name: 'test',
		on() {},
		onConversationBindingResolved() {},
		pluginConfig: {},
		registerAgentHarness() {},
		registerAutoEnableProbe() {},
		registerChannel() {},
		registerCli() {},
		registerCliBackend() {},
		registerCommand() {},
		registerCompactionProvider() {},
		registerConfigMigration() {},
		registerContextEngine() {},
		registerGatewayMethod() {},
		registerHook() {},
		registerHttpRoute() {},
		registerImageGenerationProvider() {},
		registerInteractiveHandler() {},
		registerMediaUnderstandingProvider() {},
		registerMemoryCapability() {},
		registerMemoryCorpusSupplement() {},
		registerMemoryEmbeddingProvider() {},
		registerMemoryFlushPlan() {},
		registerMemoryPromptSection() {},
		registerMemoryPromptSupplement() {},
		registerMemoryRuntime() {},
		registerMusicGenerationProvider() {},
		registerNodeHostCommand() {},
		registerProvider() {},
		registerRealtimeTranscriptionProvider() {},
		registerRealtimeVoiceProvider() {},
		registerReload() {},
		registerSecurityAuditCollector() {},
		registerService() {},
		registerSpeechProvider() {},
		registerTextTransforms() {},
		registerTool() {},
		registerVideoGenerationProvider() {},
		registerWebFetchProvider() {},
		registerWebSearchProvider() {},
		registrationMode: 'runtime' as OpenClawPluginApi['registrationMode'],
		resolvePath(input: string) {
			return input;
		},
		rootDir: process.cwd(),
		runtime: {
			state: {
				resolveStateDir() {
					return stateDir;
				},
			},
		} as OpenClawPluginApi['runtime'],
		source: 'test',
		version: '0.0.0',
	} as unknown as OpenClawPluginApi;
}

function writePublicArtifact(
	dirPath: string,
	artifactId: string,
	value: object,
) {
	const absolutePath = path.join(dirPath, `${artifactId}.json`);
	fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
	return absolutePath;
}

afterEach(() => {
	vi.restoreAllMocks();
	for (const dirPath of tempDirs.splice(0)) {
		fs.rmSync(dirPath, { force: true, recursive: true });
	}
});

describe('createContextEngine', () => {
	it('degrades cleanly without prompt', async () => {
		const engine = createContextEngine(
			createApi(),
			{
				includeMemoryPromptAddition: true,
				maxArtifactLines: 40,
				maxContextTokens: 1200,
				maxEntries: 6,
				minScore: 0.15,
			},
			{
				buildMemoryPromptAddition: vi.fn(() => 'memory prompt'),
				delegateCompact: vi.fn(async () => ({ compacted: false, ok: true })),
				getSearchManager: vi.fn(),
				listPublicArtifacts: vi.fn(async () => []),
				resolveAgentId: vi.fn(() => 'qa'),
			},
		);

		const result = await engine.assemble({
			messages: [],
			prompt: '',
			sessionId: 'session',
			sessionKey: 'session-key',
		});

		expect(result.messages).toEqual([]);
		expect(result.systemPromptAddition).toContain('memory prompt');
	});

	it('assembles recalled context with enrichment and budget', async () => {
		const publicDir = createTempDir();
		const absolutePath = writePublicArtifact(publicDir, 'artifact-1', {
			artifactId: 'artifact-1',
			classification: 'decision',
			content: 'The standard QA snack is lemon pepper wings with blue cheese.',
			source: 'qa-memory',
			sourcePath: '/memory/snack.md',
			sourceType: 'filesystem',
			updatedAt: '2026-04-15T12:00:00Z',
		});
		const manager = {
			readFile: vi.fn(async () => ({
				path: 'artifact-1',
				text: 'The standard QA snack is lemon pepper wings with blue cheese.',
			})),
			search: vi.fn(async () => [
				{
					endLine: 1,
					path: 'artifact-1',
					score: 0.9,
					snippet:
						'The standard QA snack is lemon pepper wings with blue cheese.',
					source: 'memory',
					startLine: 1,
				},
			]),
		};
		const engine = createContextEngine(
			createApi(),
			{
				includeMemoryPromptAddition: true,
				maxArtifactLines: 40,
				maxContextTokens: 1200,
				maxEntries: 6,
				minScore: 0.15,
			},
			{
				buildMemoryPromptAddition: vi.fn(() => 'memory prompt'),
				delegateCompact: vi.fn(async () => ({ compacted: false, ok: true })),
				getSearchManager: vi.fn(async () => ({
					manager: manager as never,
				})),
				listPublicArtifacts: vi.fn(async () => [
					{
						absolutePath,
						agentIds: ['qa'],
						contentType: 'json' as const,
						kind: 'mempalace-memory-artifact',
						relativePath: path.basename(absolutePath),
						workspaceDir: publicDir,
					},
				]),
				resolveAgentId: vi.fn(() => 'qa'),
			},
		);

		const result = await engine.assemble({
			availableTools: new Set(['memory_search']),
			messages: [],
			prompt: 'What snack do I usually want for QA movie night?',
			sessionId: 'session',
			sessionKey: 'session-key',
			tokenBudget: 1200,
		});

		expect(manager.search).toHaveBeenCalled();
		expect(manager.readFile).toHaveBeenCalledWith({
			from: 1,
			lines: 40,
			relPath: 'artifact-1',
		});
		expect(result.systemPromptAddition).toContain('MemPalace Recall Context');
		expect(result.systemPromptAddition).toContain('lemon pepper wings');
		expect(result.systemPromptAddition).toContain('classification: decision');
		expect(result.systemPromptAddition).toContain(
			'sourcePath: /memory/snack.md',
		);
	});

	it('falls back to the memory runtime public artifact mirror when the sdk catalog is empty', async () => {
		const api = createApi();
		const mirrorDir = path.join(
			api.runtime.state.resolveStateDir(),
			'plugins',
			'memory-mempalace',
			'public-artifacts',
		);
		fs.mkdirSync(mirrorDir, { recursive: true });
		writePublicArtifact(mirrorDir, 'artifact-needle', {
			artifactId: 'artifact-needle',
			classification: 'decision',
			content: 'Mirror recall: lemon pepper wings with blue cheese.',
			source: 'qa-memory',
			sourcePath: '/memory/snack.md',
			sourceType: 'manual',
			updatedAt: '2026-04-15T12:00:00Z',
		});

		const manager = {
			readFile: vi.fn(async () => ({
				path: 'artifact-needle',
				text: 'Mirror recall: lemon pepper wings with blue cheese.',
			})),
			search: vi.fn(async () => [
				{
					endLine: 1,
					path: 'artifact-needle',
					score: 0.8,
					snippet: 'Mirror recall: lemon pepper wings with blue cheese.',
					source: 'memory',
					startLine: 1,
				},
			]),
		};
		const engine = createContextEngine(
			api,
			{
				includeMemoryPromptAddition: true,
				maxArtifactLines: 40,
				maxContextTokens: 1200,
				maxEntries: 6,
				minScore: 0.15,
			},
			{
				buildMemoryPromptAddition: vi.fn(() => 'memory prompt'),
				delegateCompact: vi.fn(async () => ({ compacted: false, ok: true })),
				getSearchManager: vi.fn(async () => ({
					manager: manager as never,
				})),
				listPublicArtifacts: vi.fn(async () => []),
				resolveAgentId: vi.fn(() => 'qa'),
			},
		);

		const result = await engine.assemble({
			messages: [],
			prompt: 'What snack do I usually want for QA movie night?',
			sessionId: 'session',
			sessionKey: 'session-key',
			tokenBudget: 1200,
		});

		expect(result.systemPromptAddition).toContain('MemPalace Recall Context');
		expect(result.systemPromptAddition).toContain(
			'Mirror recall: lemon pepper wings',
		);
	});

	it('delegates compaction to the runtime helper', async () => {
		const delegateCompact = vi.fn(async () => ({
			compacted: false,
			ok: true,
			reason: 'delegated',
		}));
		const engine = createContextEngine(
			createApi(),
			{
				includeMemoryPromptAddition: true,
				maxArtifactLines: 40,
				maxContextTokens: 1200,
				maxEntries: 6,
				minScore: 0.15,
			},
			{
				buildMemoryPromptAddition: vi.fn(),
				delegateCompact,
				getSearchManager: vi.fn(),
				listPublicArtifacts: vi.fn(async () => []),
				resolveAgentId: vi.fn(() => 'qa'),
			},
		);

		const result = await engine.compact({
			sessionFile: '/tmp/session.json',
			sessionId: 'session',
		});

		expect(delegateCompact).toHaveBeenCalled();
		expect(result.reason).toBe('delegated');
	});
});
