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
	parseWithSchema,
} from '@mempalace-openclaw/shared';

import { composeMemorySearchResults } from '../retrieval/composer.js';

export class MemoryRuntimeService {
	private readonly artifactCache = new Map<string, MemoryArtifact>();

	private cacheState: MemoryStatusCache = {
		artifactEntries: 0,
		metadataEntries: 0,
		stale: false,
	};

	private diagnosticsState: MemoryStatusDiagnostics = {
		duplicateResultsCollapsed: 0,
		keywordFallbackApplied: false,
		rankingProfile: 'v2',
	};

	private readonly knownArtifactIds = new Set<string>();

	private lastRefreshReason?: MemoryIndexRequest['reason'];

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

	public constructor(
		private readonly client: MemPalaceClient,
		private readonly options: {
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
		this.cacheState = {
			...this.cacheState,
			artifactEntries: 0,
			lastInvalidatedAt: new Date().toISOString(),
			lastRefreshAt: new Date().toISOString(),
			lastRefreshReason: request.reason,
			metadataEntries: 0,
			stale: true,
		};
		this.artifactCache.clear();
		this.metadataCache.clear();
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
		const composed = composeMemorySearchResults(query, rawResults);

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
			...this.diagnosticsState,
			duplicateResultsCollapsed: composed.diagnostics.duplicateResultsCollapsed,
			keywordFallbackApplied: composed.diagnostics.keywordFallbackApplied,
			lastSearchLatencyMs: Math.max(0, performance.now() - startedAt),
			rankingProfile: composed.diagnostics.rankingProfile,
		};

		return composed.results;
	}

	public async status(): Promise<MemoryStatus> {
		const runtime = await this.client.getHealth();
		const sources = await this.client.listSourcesStatus();
		const lastSyncedAt = sources
			.flatMap((source) =>
				source.lastSyncedAt ? [Date.parse(source.lastSyncedAt)] : [],
			)
			.filter((value) => Number.isFinite(value))
			.sort((left, right) => right - left)[0];

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
				diagnostics: this.diagnosticsState,
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
