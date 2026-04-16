import fs from 'node:fs';
import path from 'node:path';

import {
	type ContextInjectionEntry,
	ContextInjectionEntrySchema,
	type MemoryArtifact,
	MemoryArtifactSchema,
	parseWithSchema,
} from '@mempalace-openclaw/shared';
import {
	type AssembleResult,
	buildMemorySystemPromptAddition,
	type CompactResult,
	type ContextEngine,
	delegateCompactionToRuntime,
	type MemoryPluginPublicArtifact,
	type OpenClawPluginApi,
} from 'openclaw/plugin-sdk';
import type { MemorySearchManager } from 'openclaw/plugin-sdk/memory-core-host-engine-storage';
import {
	listActiveMemoryPublicArtifacts,
	resolveSessionAgentId,
} from 'openclaw/plugin-sdk/memory-host-core';
import { getActiveMemorySearchManager } from 'openclaw/plugin-sdk/memory-host-search';

import type { ResolvedContextEngineMempalacePluginConfig } from './config.js';
import { appendContextEngineEvidence } from './evidence.js';

const CLASSIFICATION_PRIORITY = {
	artifact: 3,
	conversation: 4,
	decision: 0,
	milestone: 2,
	problem: 1,
} as const;
const MEMORY_PLUGIN_ID = 'memory-mempalace';

function approximateTokens(text: string): number {
	return Math.max(1, Math.ceil(text.length / 4));
}

type ContextMessages = Parameters<ContextEngine['assemble']>[0]['messages'];

function approximateMessageTokens(messages: ContextMessages): number {
	return approximateTokens(JSON.stringify(messages));
}

function computeRecency(updatedAt: string): string {
	const ageMs = Date.now() - Date.parse(updatedAt);
	if (!Number.isFinite(ageMs) || ageMs < 1000 * 60 * 60 * 24) {
		return 'recent';
	}
	if (ageMs < 1000 * 60 * 60 * 24 * 30) {
		return 'warm';
	}
	return 'historical';
}

function compareEntries(
	left: ContextInjectionEntry,
	right: ContextInjectionEntry,
): number {
	const scoreDelta = (right.score ?? 0) - (left.score ?? 0);
	if (scoreDelta !== 0) {
		return scoreDelta;
	}

	const classificationDelta =
		CLASSIFICATION_PRIORITY[left.classification] -
		CLASSIFICATION_PRIORITY[right.classification];
	if (classificationDelta !== 0) {
		return classificationDelta;
	}

	return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

function removeRedundantEntries(
	entries: ContextInjectionEntry[],
): ContextInjectionEntry[] {
	const seenArtifacts = new Set<string>();
	const seenPayloads = new Set<string>();
	const output: ContextInjectionEntry[] = [];

	for (const entry of entries) {
		if (seenArtifacts.has(entry.artifactId)) {
			continue;
		}

		const redundancyKey = `${entry.sourcePath}:${entry.content.trim().toLowerCase()}`;
		if (seenPayloads.has(redundancyKey)) {
			continue;
		}

		seenArtifacts.add(entry.artifactId);
		seenPayloads.add(redundancyKey);
		output.push(entry);
	}

	return output;
}

function buildContextBlock(
	entries: ContextInjectionEntry[],
): string | undefined {
	if (entries.length === 0) {
		return undefined;
	}

	const body = entries
		.map((entry) =>
			[
				`artifactId: ${entry.artifactId}`,
				`classification: ${entry.classification}`,
				`source: ${entry.source}`,
				`sourcePath: ${entry.sourcePath}`,
				`updatedAt: ${entry.updatedAt}`,
				`recency: ${entry.recency}`,
				entry.score !== undefined ? `score: ${entry.score.toFixed(3)}` : null,
				'content:',
				entry.content,
			]
				.filter(Boolean)
				.join('\n'),
		)
		.join('\n\n---\n\n');

	return `MemPalace Recall Context\n\n${body}`;
}

function combineSystemPromptAddition(params: {
	basePromptAddition: string | undefined;
	contextBlock: string | undefined;
}): string | undefined {
	const sections = [params.basePromptAddition, params.contextBlock]
		.filter((value): value is string => Boolean(value))
		.join('\n\n');
	return sections.length > 0 ? sections : undefined;
}

function readPublicArtifactFile(
	publicArtifact: MemoryPluginPublicArtifact,
): MemoryArtifact | undefined {
	try {
		return parseWithSchema(
			MemoryArtifactSchema,
			JSON.parse(fs.readFileSync(publicArtifact.absolutePath, 'utf8')),
			'Invalid memory public artifact.',
		);
	} catch {
		return undefined;
	}
}

function loadFilesystemMirrorCatalog(
	stateDir: string,
): Map<string, MemoryArtifact> {
	const catalog = new Map<string, MemoryArtifact>();
	const artifactsDir = path.join(
		stateDir,
		'plugins',
		MEMORY_PLUGIN_ID,
		'public-artifacts',
	);
	if (!fs.existsSync(artifactsDir)) {
		return catalog;
	}

	for (const entry of fs.readdirSync(artifactsDir)) {
		if (!entry.endsWith('.json')) {
			continue;
		}

		try {
			const artifact = parseWithSchema(
				MemoryArtifactSchema,
				JSON.parse(fs.readFileSync(path.join(artifactsDir, entry), 'utf8')),
				'Invalid memory public artifact mirror.',
			);
			catalog.set(artifact.artifactId, artifact);
		} catch {
			// Ignore malformed mirror entries and keep the catalog best-effort.
		}
	}

	return catalog;
}

async function loadPublicArtifactCatalog(
	api: OpenClawPluginApi,
	listPublicArtifacts: typeof listActiveMemoryPublicArtifacts,
): Promise<Map<string, MemoryArtifact>> {
	const publicArtifacts = await listPublicArtifacts({
		cfg: api.config,
	});
	const catalog = new Map<string, MemoryArtifact>();

	for (const publicArtifact of publicArtifacts) {
		const artifact = readPublicArtifactFile(publicArtifact);
		if (artifact) {
			catalog.set(artifact.artifactId, artifact);
		}
	}

	if (catalog.size === 0) {
		for (const [artifactId, artifact] of loadFilesystemMirrorCatalog(
			api.runtime.state.resolveStateDir(),
		)) {
			catalog.set(artifactId, artifact);
		}
	}

	return catalog;
}

type EngineDependencies = {
	buildMemoryPromptAddition?: typeof buildMemorySystemPromptAddition;
	delegateCompact?: typeof delegateCompactionToRuntime;
	getSearchManager?: typeof getActiveMemorySearchManager;
	listPublicArtifacts?: typeof listActiveMemoryPublicArtifacts;
	resolveAgentId?: typeof resolveSessionAgentId;
};

export function createContextEngine(
	api: OpenClawPluginApi,
	config: ResolvedContextEngineMempalacePluginConfig,
	deps: EngineDependencies = {},
): ContextEngine {
	const buildMemoryPromptAddition =
		deps.buildMemoryPromptAddition ?? buildMemorySystemPromptAddition;
	const delegateCompact = deps.delegateCompact ?? delegateCompactionToRuntime;
	const resolveAgentId = deps.resolveAgentId ?? resolveSessionAgentId;
	const getSearchManager =
		deps.getSearchManager ?? getActiveMemorySearchManager;
	const listPublicArtifacts =
		deps.listPublicArtifacts ?? listActiveMemoryPublicArtifacts;

	type AssembleParams = Parameters<ContextEngine['assemble']>[0];

	async function createBaseAssembleResult(
		params: AssembleParams,
		contextBlock?: string,
	): Promise<AssembleResult> {
		const basePromptAddition = config.includeMemoryPromptAddition
			? buildMemoryPromptAddition({
					availableTools: params.availableTools ?? new Set<string>(),
					...(params.citationsMode
						? {
								citationsMode: params.citationsMode,
							}
						: {}),
				})
			: undefined;
		const systemPromptAddition = combineSystemPromptAddition({
			basePromptAddition,
			contextBlock,
		});
		const estimatedTokens =
			approximateMessageTokens(params.messages) +
			(systemPromptAddition ? approximateTokens(systemPromptAddition) : 0);

		return {
			estimatedTokens,
			messages: params.messages,
			...(systemPromptAddition
				? {
						systemPromptAddition,
					}
				: {}),
		};
	}

	return {
		async afterTurn(
			params: Parameters<NonNullable<ContextEngine['afterTurn']>>[0],
		) {
			appendContextEngineEvidence('engine.afterTurn', {
				isHeartbeat: params.isHeartbeat,
				messageCount: params.messages.length,
				prePromptMessageCount: params.prePromptMessageCount,
				sessionId: params.sessionId,
				sessionKey: params.sessionKey,
				tokenBudget: params.tokenBudget,
			});
		},
		async assemble(params: AssembleParams) {
			appendContextEngineEvidence('engine.assemble.start', {
				messageCount: params.messages.length,
				model: params.model,
				prompt: params.prompt,
				sessionId: params.sessionId,
				sessionKey: params.sessionKey,
				tokenBudget: params.tokenBudget,
			});

			if (!params.prompt?.trim()) {
				appendContextEngineEvidence('engine.assemble.degraded', {
					reason: 'missing-prompt',
					sessionId: params.sessionId,
				});
				return createBaseAssembleResult(params);
			}

			const agentId = resolveAgentId({
				config: api.config,
				...(params.sessionKey
					? {
							sessionKey: params.sessionKey,
						}
					: {}),
			});

			let manager: MemorySearchManager | null = null;
			try {
				const resolved = await getSearchManager({
					agentId,
					cfg: api.config,
					purpose: 'default',
				});
				manager = resolved.manager;
				if (!manager || resolved.error) {
					appendContextEngineEvidence('engine.assemble.degraded', {
						agentId,
						error: resolved.error,
						reason: 'manager-unavailable',
						sessionId: params.sessionId,
					});
					return createBaseAssembleResult(params);
				}
			} catch (error) {
				appendContextEngineEvidence('engine.assemble.degraded', {
					agentId,
					error: error instanceof Error ? error.message : String(error),
					reason: 'manager-error',
					sessionId: params.sessionId,
				});
				return createBaseAssembleResult(params);
			}

			const searchResults = await manager.search(params.prompt, {
				maxResults: config.maxEntries * 2,
				minScore: config.minScore,
				...(params.sessionKey
					? {
							sessionKey: params.sessionKey,
						}
					: {}),
			});
			appendContextEngineEvidence('engine.assemble.search', {
				agentId,
				resultCount: searchResults.length,
				sessionId: params.sessionId,
			});

			if (searchResults.length === 0) {
				return createBaseAssembleResult(params);
			}

			const catalogEntries = await listPublicArtifacts({
				cfg: api.config,
			});
			appendContextEngineEvidence('engine.assemble.catalog', {
				catalogCount: catalogEntries.length,
				sessionId: params.sessionId,
			});
			const publicArtifactCatalog = await loadPublicArtifactCatalog(
				api,
				listPublicArtifacts,
			);
			appendContextEngineEvidence('engine.assemble.catalog.resolved', {
				catalogCount: publicArtifactCatalog.size,
				sessionId: params.sessionId,
				source:
					catalogEntries.length > 0 ? 'sdk-or-sdk+mirror' : 'mirror-or-empty',
			});

			const enrichedEntries: ContextInjectionEntry[] = [];
			for (const result of searchResults) {
				const file = await manager.readFile({
					from: 1,
					lines: config.maxArtifactLines,
					relPath: result.path,
				});
				appendContextEngineEvidence('engine.assemble.read', {
					artifactId: result.path,
					sessionId: params.sessionId,
				});

				let artifact = publicArtifactCatalog.get(result.path);
				if (!artifact) {
					const refreshedCatalog = await loadPublicArtifactCatalog(
						api,
						listPublicArtifacts,
					);
					appendContextEngineEvidence('engine.assemble.catalog.refresh', {
						catalogCount: refreshedCatalog.size,
						sessionId: params.sessionId,
					});
					artifact = refreshedCatalog.get(result.path);
				}
				if (!artifact) {
					continue;
				}

				const entry = parseWithSchema(
					ContextInjectionEntrySchema,
					{
						artifactId: artifact.artifactId,
						classification: artifact.classification,
						content: file.text || artifact.content,
						recency: computeRecency(artifact.updatedAt),
						score: result.score,
						source: artifact.source,
						sourcePath: artifact.sourcePath,
						sourceType: artifact.sourceType,
						updatedAt: artifact.updatedAt,
					},
					'Invalid context injection entry.',
				);
				enrichedEntries.push(entry);
			}

			const orderedEntries = removeRedundantEntries(enrichedEntries)
				.sort(compareEntries)
				.slice(0, config.maxEntries);
			const effectiveBudget =
				params.tokenBudget === undefined
					? config.maxContextTokens
					: Math.min(params.tokenBudget, config.maxContextTokens);

			const budgetedEntries: ContextInjectionEntry[] = [];
			let usedTokens = 0;
			for (const entry of orderedEntries) {
				const entryTokens = approximateTokens(
					buildContextBlock([entry]) ?? entry.content,
				);
				if (usedTokens + entryTokens > effectiveBudget) {
					continue;
				}
				budgetedEntries.push(entry);
				usedTokens += entryTokens;
			}

			const contextBlock = buildContextBlock(budgetedEntries);
			appendContextEngineEvidence('engine.assemble.complete', {
				agentId,
				contextBlockGenerated: Boolean(contextBlock),
				effectiveBudget,
				selectedArtifactIds: budgetedEntries.map((entry) => entry.artifactId),
				sessionId: params.sessionId,
				usedTokens,
			});

			return createBaseAssembleResult(params, contextBlock);
		},
		async bootstrap(
			params: Parameters<NonNullable<ContextEngine['bootstrap']>>[0],
		) {
			appendContextEngineEvidence('engine.bootstrap', {
				sessionId: params.sessionId,
				sessionKey: params.sessionKey,
			});
			return {
				bootstrapped: true,
				importedMessages: 0,
			};
		},
		async compact(
			params: Parameters<ContextEngine['compact']>[0],
		): Promise<CompactResult> {
			appendContextEngineEvidence('engine.compact', {
				force: params.force,
				sessionId: params.sessionId,
				sessionKey: params.sessionKey,
				tokenBudget: params.tokenBudget,
			});
			return delegateCompact(params);
		},
		async dispose() {
			appendContextEngineEvidence('engine.dispose');
		},
		info: {
			id: 'claw-context-mempalace',
			name: 'MemPalace Context Engine',
			ownsCompaction: false,
			version: '0.0.0',
		},
		async ingest(params: Parameters<ContextEngine['ingest']>[0]) {
			appendContextEngineEvidence('engine.ingest', {
				isHeartbeat: params.isHeartbeat,
				sessionId: params.sessionId,
				sessionKey: params.sessionKey,
			});
			return { ingested: true };
		},
	};
}
