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
	MemoryStatusSchema,
	type MemPalaceClient,
	parseWithSchema,
} from '@mempalace-openclaw/shared';

import {
	applyKeywordFallback,
	composeMemorySearchResults,
} from '../retrieval/composer.js';

export class MemoryRuntimeService {
	private readonly artifactCache = new Map<string, MemoryArtifact>();

	private readonly knownArtifactIds = new Set<string>();

	public constructor(private readonly client: MemPalaceClient) {}

	public async close(): Promise<void> {
		if ('close' in this.client && typeof this.client.close === 'function') {
			await this.client.close();
		}
	}

	public async get(artifactId: string): Promise<MemoryArtifact> {
		const cached = this.artifactCache.get(artifactId);
		if (cached) {
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
		await this.client.refreshIndex(request);
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
		const rawResults = await this.client.search(query);
		const composed = composeMemorySearchResults(query, rawResults);
		const fallback = applyKeywordFallback(query, composed);

		for (const result of fallback) {
			this.knownArtifactIds.add(result.artifactId);
		}

		return fallback;
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
				contextEngineCompatible: true,
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
	}
}
