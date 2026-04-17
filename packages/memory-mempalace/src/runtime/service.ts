import {
	type MemoryArtifact,
	type MemoryIndexRequest,
	MemoryIndexRequestSchema,
	type MemoryPromoteInput,
	MemoryPromoteInputSchema,
	type MemorySearchQuery,
	MemorySearchQuerySchema,
	type MemorySearchResult,
	type MemoryStatus,
	type MemoryStatusCache,
	type MemoryStatusDiagnostics,
	MemoryStatusSchema,
	type MemPalaceClient,
	type MemPalaceDiaryClient,
	type MemPalaceKnowledgeGraphClient,
	parseWithSchema,
} from '@mempalace-openclaw/shared';

import type { ResolvedMemoryMempalaceAdvancedConfig } from '../config.js';
import { composeMemorySearchResults } from '../retrieval/composer.js';
import type { RankingProfile } from '../retrieval/ranking.js';

type AdvancedCapabilityStatus = NonNullable<
	MemoryStatusDiagnostics['advancedCapabilities']
>;

type SearchSummary = {
	expansionApplied: boolean;
	expansionSource?: 'kg' | 'lexical';
	expandedTerms?: string[];
	expandedQuery?: string;
	rankingProfile: RankingProfile;
	resultCount: number;
	topScore?: number;
};

type CapabilityAwareClient = MemPalaceClient &
	Partial<MemPalaceDiaryClient> &
	Partial<MemPalaceKnowledgeGraphClient> & {
		capabilities?: () => Promise<Set<string>>;
	};

function uniqueTerms(values: string[]): string[] {
	const seen = new Set<string>();
	const terms: string[] = [];
	for (const value of values) {
		const normalized = value.trim().toLowerCase();
		if (!normalized || seen.has(normalized)) {
			continue;
		}
		seen.add(normalized);
		terms.push(normalized);
	}
	return terms;
}

function extractLexicalExpansionTerms(
	query: MemorySearchQuery,
	results: MemorySearchResult[],
	maxExpandedTerms: number,
): string[] {
	const originalTerms = new Set(
		query.query
			.toLowerCase()
			.split(/\s+/)
			.map((term) => term.trim())
			.filter(Boolean),
	);

	const candidates: string[] = [];
	for (const result of results.slice(0, 4)) {
		for (const token of [
			...result.snippet.split(/[^a-zA-Z0-9_-]+/),
			...result.source.split(/[^a-zA-Z0-9_-]+/),
			...result.sourcePath.split(/[^a-zA-Z0-9_-]+/),
			...(Array.isArray(result.metadata?.aliases)
				? result.metadata.aliases.filter(
						(value): value is string => typeof value === 'string',
					)
				: []),
		]) {
			const normalized = token.trim().toLowerCase();
			if (
				normalized.length < 4 ||
				originalTerms.has(normalized) ||
				/^\d+$/.test(normalized)
			) {
				continue;
			}
			candidates.push(normalized);
		}
	}

	return uniqueTerms(candidates).slice(0, maxExpandedTerms);
}

export class MemoryRuntimeService {
	private readonly artifactCache = new Map<string, MemoryArtifact>();

	private cacheState: MemoryStatusCache = {
		artifactEntries: 0,
		metadataEntries: 0,
		stale: false,
	};

	private diagnosticsState: MemoryStatusDiagnostics = {
		cacheEvictions: 0,
		contextCompactions: 0,
		duplicateResultsCollapsed: 0,
		keywordFallbackApplied: false,
		rankingProfile: 'v2',
	};

	private readonly knownArtifactIds = new Set<string>();

	private lastRefreshReason?: MemoryIndexRequest['reason'];

	private cachedCapabilities?: Set<string>;

	private readonly metadataCache = new Map<
		string,
		{
			classification: MemorySearchResult['classification'];
			memoryType?: MemorySearchResult['memoryType'];
			source: string;
			sourcePath: string;
			sourceType: string;
			updatedAt: string;
		}
	>();

	private lastSearchSummary: SearchSummary = {
		expansionApplied: false,
		rankingProfile: 'v2',
		resultCount: 0,
	};

	public constructor(
		private readonly client: CapabilityAwareClient,
		private readonly options: {
			advanced?: ResolvedMemoryMempalaceAdvancedConfig;
			agentId?: string;
			onArtifactRecorded?: (artifact: MemoryArtifact) => void;
		} = {},
	) {}

	public async close(): Promise<void> {
		if ('close' in this.client && typeof this.client.close === 'function') {
			await this.client.close();
		}
	}

	public async get(artifactId: string): Promise<MemoryArtifact> {
		const cached = this.artifactCache.get(artifactId);
		if (cached) {
			this.recomputeCacheState({
				stale: false,
			});
			return cached;
		}

		const artifact = await this.client.get(artifactId);
		this.recordArtifact(artifact);
		return artifact;
	}

	public async index(requestInput: MemoryIndexRequest): Promise<void> {
		const request = parseWithSchema(
			MemoryIndexRequestSchema,
			requestInput,
			'Invalid memory index request.',
		);
		const startedAt = performance.now();
		await this.client.refreshIndex(request);
		this.lastRefreshReason = request.reason;
		this.evictCaches({
			lastRefreshAt: new Date().toISOString(),
			lastRefreshReason: request.reason,
			stale: true,
		});
		this.diagnosticsState = {
			...this.diagnosticsState,
			lastRefreshLatencyMs: Math.max(0, performance.now() - startedAt),
		};
	}

	public async promote(input: MemoryPromoteInput): Promise<MemoryArtifact> {
		const promoteInput = parseWithSchema(
			MemoryPromoteInputSchema,
			input,
			'Invalid memory promote input.',
		);
		const artifact = await this.client.promote(promoteInput);
		this.recordArtifact(artifact);
		return artifact;
	}

	public async search(
		queryInput: MemorySearchQuery,
	): Promise<MemorySearchResult[]> {
		const query = parseWithSchema(
			MemorySearchQuerySchema,
			queryInput,
			'Invalid memory search query.',
		);
		const startedAt = performance.now();
		const rawResults = await this.client.search(query);
		const rankingProfile = this.resolveRankingProfile();
		let composed = composeMemorySearchResults(query, rawResults, {
			...(this.options.agentId ? { agentId: this.options.agentId } : {}),
			...(this.options.advanced?.pinnedMemory !== undefined
				? { pinnedMemory: this.options.advanced.pinnedMemory }
				: {}),
			rankingProfile,
		});
		let searchSummary: SearchSummary = {
			expansionApplied: false,
			rankingProfile,
			resultCount: composed.results.length,
			...(composed.results[0]
				? {
						topScore: composed.results[0].score,
					}
				: {}),
		};

		if (
			this.options.advanced?.queryExpansion &&
			this.shouldExpandResults(composed.results)
		) {
			const expanded = await this.buildExpandedQuery(query, composed.results);
			if (
				expanded?.query &&
				expanded.query.trim().toLowerCase() !== query.query.trim().toLowerCase()
			) {
				const expandedResults = (
					await this.client.search({
						...query,
						query: expanded.query,
					})
				).map((result) => ({
					...result,
					retrievalReason:
						result.retrievalReason ??
						(expanded.source === 'kg' ? 'expanded:kg' : 'expanded:lexical'),
				}));
				composed = composeMemorySearchResults(
					query,
					[...rawResults, ...expandedResults],
					{
						...(this.options.agentId ? { agentId: this.options.agentId } : {}),
						...(this.options.advanced?.pinnedMemory !== undefined
							? { pinnedMemory: this.options.advanced.pinnedMemory }
							: {}),
						rankingProfile,
					},
				);
				searchSummary = {
					expansionApplied: true,
					...(expanded.expandedTerms.length > 0
						? {
								expandedTerms: expanded.expandedTerms,
							}
						: {}),
					expandedQuery: expanded.query,
					rankingProfile,
					resultCount: composed.results.length,
					...(expanded.source
						? {
								expansionSource: expanded.source,
							}
						: {}),
					...(composed.results[0]
						? {
								topScore: composed.results[0].score,
							}
						: {}),
				};
			}
		}

		for (const result of composed.results) {
			this.knownArtifactIds.add(result.artifactId);
			this.metadataCache.set(result.artifactId, {
				classification: result.classification,
				...(result.memoryType ? { memoryType: result.memoryType } : {}),
				source: result.source,
				sourcePath: result.sourcePath,
				sourceType: result.sourceType,
				updatedAt: result.updatedAt,
			});
		}
		this.recomputeCacheState({
			...(this.cacheState.lastRefreshAt
				? {
						lastRefreshAt: this.cacheState.lastRefreshAt,
					}
				: {}),
			...(this.lastRefreshReason
				? {
						lastRefreshReason: this.lastRefreshReason,
					}
				: {}),
			stale: false,
		});
		this.diagnosticsState = {
			...(await this.resolveAdvancedDiagnostics()),
			...this.diagnosticsState,
			duplicateResultsCollapsed: composed.diagnostics.duplicateResultsCollapsed,
			keywordFallbackApplied: composed.diagnostics.keywordFallbackApplied,
			lastSearchLatencyMs: Math.max(0, performance.now() - startedAt),
			rankingProfile: composed.diagnostics.rankingProfile,
		};
		this.lastSearchSummary = searchSummary;

		return composed.results;
	}

	public getLastSearchSummary(): SearchSummary {
		return this.lastSearchSummary;
	}

	public async status(): Promise<MemoryStatus> {
		const runtime = await this.client.getHealth();
		const sources = await this.client.listSourcesStatus();
		const lastSyncedAt = sources
			.flatMap((source) => {
				const lastSyncedAt = source.lastSyncedAt;
				return typeof lastSyncedAt === 'string'
					? [Date.parse(lastSyncedAt)]
					: [];
			})
			.filter((value: number) => Number.isFinite(value))
			.sort((left: number, right: number) => right - left)[0];

		const ingestionLagSeconds =
			lastSyncedAt === undefined
				? 0
				: Math.max(0, Math.floor((Date.now() - lastSyncedAt) / 1000));

		return parseWithSchema(
			MemoryStatusSchema,
			{
				activeMemoryCompatible: true,
				cache: this.cacheState,
				contextEngineCompatible: true,
				diagnostics: {
					...(await this.resolveAdvancedDiagnostics()),
					...this.diagnosticsState,
				},
				ingestionLagSeconds,
				memoryCount: this.knownArtifactIds.size,
				runtime,
				sources,
			},
			'Invalid memory status payload.',
		);
	}

	private recordArtifact(artifact: MemoryArtifact): void {
		this.artifactCache.set(artifact.artifactId, artifact);
		this.knownArtifactIds.add(artifact.artifactId);
		this.metadataCache.set(artifact.artifactId, {
			classification: artifact.classification,
			...(artifact.memoryType ? { memoryType: artifact.memoryType } : {}),
			source: artifact.source,
			sourcePath: artifact.sourcePath,
			sourceType: artifact.sourceType,
			updatedAt: artifact.updatedAt,
		});
		this.recomputeCacheState({
			...(this.cacheState.lastRefreshAt
				? {
						lastRefreshAt: this.cacheState.lastRefreshAt,
					}
				: {}),
			...(this.lastRefreshReason
				? {
						lastRefreshReason: this.lastRefreshReason,
					}
				: {}),
			stale: false,
		});
		this.options.onArtifactRecorded?.(artifact);
	}

	public recordContextCompaction(): void {
		this.diagnosticsState = {
			...this.diagnosticsState,
			contextCompactions: (this.diagnosticsState.contextCompactions ?? 0) + 1,
		};
	}

	private async buildExpandedQuery(
		query: MemorySearchQuery,
		results: MemorySearchResult[],
	): Promise<
		| {
				expandedTerms: string[];
				query: string;
				source?: 'kg' | 'lexical';
		  }
		| undefined
	> {
		const baseTerms = uniqueTerms(query.query.split(/\s+/));
		let expandedTerms: string[] = [];
		let expansionSource: 'kg' | 'lexical' | undefined;
		const capabilities = await this.getCapabilities();
		const hasGraphExpansion =
			this.options.advanced?.knowledgeGraph &&
			capabilities.has('mempalace_graph_expand_query') &&
			typeof this.client.expandQuery === 'function';

		if (hasGraphExpansion) {
			try {
				const expanded = await this.client.expandQuery?.(query);
				expandedTerms = expanded?.expandedTerms ?? [];
				if (expandedTerms.length > 0) {
					expansionSource = 'kg';
				}
			} catch {
				expandedTerms = [];
			}
		}

		if (expandedTerms.length === 0) {
			expandedTerms = extractLexicalExpansionTerms(
				query,
				results,
				this.options.advanced?.maxExpandedTerms ?? 5,
			);
			if (expandedTerms.length > 0) {
				expansionSource = 'lexical';
			}
		}

		const merged = uniqueTerms([...baseTerms, ...expandedTerms]).slice(
			0,
			Math.max(baseTerms.length, this.options.advanced?.maxExpandedTerms ?? 5),
		);
		return merged.length === 0
			? undefined
			: {
					expandedTerms,
					query: merged.join(' '),
					...(expansionSource
						? {
								source: expansionSource,
							}
						: {}),
				};
	}

	private evictCaches(overrides: Partial<MemoryStatusCache>): void {
		const evictedEntries = this.artifactCache.size + this.metadataCache.size;
		this.artifactCache.clear();
		this.metadataCache.clear();
		this.cacheState = {
			artifactEntries: 0,
			lastInvalidatedAt: new Date().toISOString(),
			metadataEntries: 0,
			stale: true,
			...overrides,
		};
		this.diagnosticsState = {
			...this.diagnosticsState,
			cacheEvictions:
				(this.diagnosticsState.cacheEvictions ?? 0) + evictedEntries,
		};
	}

	private async getCapabilities(): Promise<Set<string>> {
		if (this.cachedCapabilities) {
			return this.cachedCapabilities;
		}
		const capabilities =
			typeof this.client.capabilities === 'function'
				? await this.client.capabilities()
				: new Set<string>();
		this.cachedCapabilities = capabilities;
		return capabilities;
	}

	private resolveRankingProfile(): RankingProfile {
		return this.options.advanced?.pinnedMemory ? 'v3' : 'v2';
	}

	private async resolveAdvancedDiagnostics(): Promise<
		Pick<MemoryStatusDiagnostics, 'advancedCapabilities'>
	> {
		const capabilities = await this.getCapabilities();
		const advanced = this.options.advanced;
		const diaryBaseFallback =
			capabilities.has('mempalace_add_drawer') &&
			capabilities.has('mempalace_search');
		const advancedCapabilities: AdvancedCapabilityStatus = {
			agentDiaries: advanced?.agentDiaries
				? capabilities.has('mempalace_diary_append') || diaryBaseFallback
					? 'enabled'
					: 'unavailable'
				: 'disabled',
			knowledgeGraph: advanced?.knowledgeGraph
				? capabilities.has('mempalace_graph_expand_query') ||
					capabilities.has('mempalace_graph_upsert')
					? 'enabled'
					: 'unavailable'
				: 'disabled',
			pinnedMemory: advanced?.pinnedMemory ? 'enabled' : 'disabled',
			queryExpansion: advanced?.queryExpansion ? 'enabled' : 'disabled',
		};

		return { advancedCapabilities };
	}

	private shouldExpandResults(results: MemorySearchResult[]): boolean {
		if (!this.options.advanced?.queryExpansion) {
			return false;
		}
		if (results.length === 0) {
			return true;
		}
		const topScore = results[0]?.score ?? 0;
		return (
			topScore < this.options.advanced.lowConfidenceScoreThreshold ||
			results.length < 2
		);
	}

	private recomputeCacheState(
		overrides: Partial<MemoryStatusCache> = {},
	): void {
		this.cacheState = {
			artifactEntries: this.artifactCache.size,
			metadataEntries: this.metadataCache.size,
			stale: false,
			...overrides,
		};
	}
}
