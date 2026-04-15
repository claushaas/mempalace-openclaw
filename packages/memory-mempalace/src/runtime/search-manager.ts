import type {
	MemoryArtifact,
	MemoryIndexRequest,
	MemoryStatus,
} from '@mempalace-openclaw/shared';
import {
	parseWithSchema,
	RuntimeRefreshReasonSchema,
} from '@mempalace-openclaw/shared';
import type {
	MemorySearchResult as HostMemorySearchResult,
	MemoryEmbeddingProbeResult,
	MemoryProviderStatus,
	MemorySearchManager,
	MemorySyncProgressUpdate,
} from 'openclaw/plugin-sdk/memory-core-host-engine-storage';
import { appendHostRealEvidence } from './evidence.js';
import type { MemoryRuntimeService } from './service.js';

function toHostMemoryResult(result: {
	artifactId: string;
	score: number;
	snippet: string;
	sourcePath: string;
}): HostMemorySearchResult {
	const lineCount = Math.max(1, result.snippet.split('\n').length);

	return {
		citation: `${result.sourcePath}:1`,
		endLine: lineCount,
		path: result.artifactId,
		score: result.score,
		snippet: result.snippet,
		source: 'memory',
		startLine: 1,
	};
}

function sliceArtifactText(
	artifact: MemoryArtifact,
	from = 1,
	lines?: number,
): string {
	if (!lines) {
		return artifact.content;
	}

	const allLines = artifact.content.split('\n');
	return allLines
		.slice(Math.max(0, from - 1), Math.max(0, from - 1) + lines)
		.join('\n');
}

function mapReason(reason?: string): MemoryIndexRequest['reason'] {
	const normalized = (reason ?? '').toLowerCase();
	if (normalized.includes('post')) {
		return 'post-ingest';
	}
	if (normalized.includes('schedule')) {
		return 'scheduled-sync';
	}
	if (normalized.includes('checkpoint')) {
		return 'checkpoint-refresh';
	}
	if (normalized.includes('cache')) {
		return 'cache-refresh';
	}

	return parseWithSchema(
		RuntimeRefreshReasonSchema,
		'manual-reindex',
		'Invalid runtime refresh reason.',
	);
}

function toProviderStatus(status: MemoryStatus): MemoryProviderStatus {
	return {
		backend: 'builtin',
		chunks: status.memoryCount,
		custom: {
			activeMemoryCompatible: status.activeMemoryCompatible,
			backendReachable: status.runtime.backendReachable,
			contextEngineCompatible: status.contextEngineCompatible,
			ingestionLagSeconds: status.ingestionLagSeconds,
			lastRefreshAt: status.runtime.lastRefreshAt,
			message: status.runtime.message,
			status: status.runtime.status,
		},
		files: status.memoryCount,
		provider: 'mempalace-mcp',
		sourceCounts: [
			{
				chunks: status.memoryCount,
				files: status.memoryCount,
				source: 'memory',
			},
		],
		sources: ['memory'],
	};
}

export class MemPalaceMemorySearchManager implements MemorySearchManager {
	private cachedStatus: MemoryStatus;

	public constructor(
		private readonly service: MemoryRuntimeService,
		initialStatus: MemoryStatus,
	) {
		this.cachedStatus = initialStatus;
	}

	public async close(): Promise<void> {
		appendHostRealEvidence('manager.close');
		await this.service.close();
	}

	public async probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult> {
		appendHostRealEvidence('manager.probeEmbeddingAvailability');
		try {
			const status = await this.service.status();
			this.cachedStatus = status;
			return status.runtime.backendReachable
				? { ok: true }
				: {
						error:
							status.runtime.message ?? 'MemPalace backend is unreachable.',
						ok: false,
					};
		} catch (error) {
			return {
				error: error instanceof Error ? error.message : String(error),
				ok: false,
			};
		}
	}

	public async probeVectorAvailability(): Promise<boolean> {
		appendHostRealEvidence('manager.probeVectorAvailability');
		const status = await this.service.status();
		this.cachedStatus = status;
		return status.runtime.backendReachable;
	}

	public async readFile(params: {
		relPath: string;
		from?: number;
		lines?: number;
	}): Promise<{ path: string; text: string }> {
		appendHostRealEvidence('manager.readFile', params);
		const artifact = await this.service.get(params.relPath);
		const text = sliceArtifactText(artifact, params.from, params.lines);
		return {
			path: params.relPath,
			text,
		};
	}

	public async search(
		query: string,
		opts?: {
			maxResults?: number;
			minScore?: number;
			sessionKey?: string;
		},
	): Promise<HostMemorySearchResult[]> {
		appendHostRealEvidence('manager.search', {
			maxResults: opts?.maxResults,
			minScore: opts?.minScore,
			query,
			sessionKey: opts?.sessionKey,
		});

		const results = await this.service.search({
			limit: opts?.maxResults,
			query,
		});
		const minScore = opts?.minScore;
		const filtered =
			minScore !== undefined
				? results.filter((result) => result.score >= minScore)
				: results;

		try {
			this.cachedStatus = await this.service.status();
		} catch {
			// keep last cached status when status refresh fails
		}

		return filtered.map(toHostMemoryResult);
	}

	public status(): MemoryProviderStatus {
		appendHostRealEvidence('manager.status');
		return toProviderStatus(this.cachedStatus);
	}

	public async sync(params?: {
		force?: boolean;
		progress?: (update: MemorySyncProgressUpdate) => void;
		reason?: string;
		sessionFiles?: string[];
	}): Promise<void> {
		appendHostRealEvidence('manager.sync', params ?? {});
		params?.progress?.({
			completed: 0,
			label: 'refreshing runtime metadata',
			total: 1,
		});
		await this.service.index({
			force: params?.force,
			reason: mapReason(params?.reason),
			target: 'runtime',
		});
		params?.progress?.({
			completed: 1,
			label: 'refresh complete',
			total: 1,
		});
		this.cachedStatus = await this.service.status();
	}
}
