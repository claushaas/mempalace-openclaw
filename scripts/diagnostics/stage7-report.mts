import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {
	MemoryArtifact,
	MemoryIndexRequest,
	MemoryPromoteInput,
	MemorySearchQuery,
	MemorySearchResult,
	RuntimeHealth,
	SourceStatus,
} from '../../packages/shared/src/index.ts';
import { createFingerprint } from '../../packages/shared/src/index.ts';
import { MemoryRuntimeService } from '../../packages/memory-mempalace/src/runtime/service.ts';
import {
	createSyncDaemon,
	type SyncStatePaths,
} from '../../packages/sync-daemon/src/index.ts';

type ReportMode = 'benchmark' | 'diagnostic';

type StoredArtifact = MemoryArtifact & {
	metadata?: MemoryPromoteInput['metadata'];
};

class Stage7FakeClient {
	private readonly artifacts = new Map<string, StoredArtifact>();

	private readonly refreshes: MemoryIndexRequest[] = [];

	public async close(): Promise<void> {}

	public async get(artifactId: string): Promise<MemoryArtifact> {
		const artifact = this.artifacts.get(artifactId);
		if (!artifact) {
			throw new Error(`Missing artifact ${artifactId}`);
		}
		return artifact;
	}

	public async getHealth(): Promise<RuntimeHealth> {
		return {
			backendReachable: true,
			lastRefreshAt:
				this.refreshes.length > 0
					? new Date().toISOString()
					: undefined,
			status: 'ready',
		};
	}

	public async listSourcesStatus(): Promise<SourceStatus[]> {
		const latestBySource = new Map<string, StoredArtifact>();
		for (const artifact of this.artifacts.values()) {
			const existing = latestBySource.get(artifact.source);
			if (
				!existing ||
				Date.parse(existing.updatedAt) < Date.parse(artifact.updatedAt)
			) {
				latestBySource.set(artifact.source, artifact);
			}
		}

		return [...latestBySource.entries()].map(([sourceId, artifact]) => ({
			enabled: true,
			kind:
				sourceId === 'code-main'
					? 'git'
					: sourceId === 'synthetic-main'
						? 'documents'
						: 'filesystem',
			lastSyncedAt: artifact.updatedAt,
			path: artifact.sourcePath,
			sourceId,
			syncStatus: 'completed',
		}));
	}

	public async promote(input: MemoryPromoteInput): Promise<MemoryArtifact> {
		const artifact: StoredArtifact = {
			artifactId:
				input.artifactId ??
				`artifact-${createFingerprint({ source: input.source }).slice(0, 12)}`,
			classification: input.classification,
			content: input.content ?? '',
			...(input.memoryType ? { memoryType: input.memoryType } : {}),
			source: input.source,
			sourcePath: input.sourcePath ?? '/unknown',
			sourceType:
				input.source === 'code-main'
					? 'git'
					: input.source === 'synthetic-main'
						? 'documents'
						: input.source === 'openclaw-hook-pack'
							? 'spool'
							: 'filesystem',
			metadata: input.metadata,
			updatedAt: new Date().toISOString(),
		};
		this.artifacts.set(artifact.artifactId, artifact);
		return artifact;
	}

	public async refreshIndex(
		request: MemoryIndexRequest,
	): Promise<{ accepted: true; reason: MemoryIndexRequest['reason'] }> {
		this.refreshes.push(request);
		return {
			accepted: true,
			reason: request.reason,
		};
	}

	public async search(
		query: MemorySearchQuery,
	): Promise<MemorySearchResult[]> {
		const tokens = query.query
			.toLowerCase()
			.split(/\s+/)
			.map((token) => token.trim())
			.filter(Boolean);

		const results: MemorySearchResult[] = [];
		for (const artifact of this.artifacts.values()) {
			const haystack = [
				artifact.content,
				artifact.source,
				artifact.sourcePath,
			]
				.join(' ')
				.toLowerCase();
			const matches = tokens.filter((token) => haystack.includes(token)).length;
			const baseScore = matches === 0 ? 0.04 : 0.18 + matches * 0.02;
			results.push({
				artifactId: artifact.artifactId,
				classification: artifact.classification,
				...(artifact.memoryType ? { memoryType: artifact.memoryType } : {}),
				score: baseScore,
				snippet: artifact.content.slice(0, 200),
				source: artifact.source,
				sourcePath: artifact.sourcePath,
				sourceType: artifact.sourceType,
				updatedAt: artifact.updatedAt,
			});

			if (matches > 0) {
				results.push({
					artifactId: artifact.artifactId,
					classification: artifact.classification,
					...(artifact.memoryType ? { memoryType: artifact.memoryType } : {}),
					score: Math.max(0, baseScore - 0.05),
					snippet: artifact.content.slice(0, 200),
					source: artifact.source,
					sourcePath: artifact.sourcePath,
					sourceType: artifact.sourceType,
					updatedAt: artifact.updatedAt,
				});
			}
		}

		return results;
	}

	public getArtifacts(): StoredArtifact[] {
		return [...this.artifacts.values()];
	}

	public getRefreshCount(): number {
		return this.refreshes.length;
	}
}

function createTempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'mempalace-stage7-'));
}

function resolveDiagnosticsPaths(baseDir: string): SyncStatePaths {
	return {
		baseDir,
		dbPath: path.join(baseDir, 'sync.db'),
		failedSpoolDir: path.join(baseDir, 'spool', 'failed'),
		legacySpoolDir: path.join(baseDir, 'legacy-spool'),
		lockDir: path.join(baseDir, 'locks'),
		logsDir: path.join(baseDir, 'logs'),
		pendingSpoolDir: path.join(baseDir, 'spool', 'pending'),
		processedSpoolDir: path.join(baseDir, 'spool', 'processed'),
		spoolBaseDir: path.join(baseDir, 'spool'),
	};
}

function repoPath(...segments: string[]): string {
	return path.resolve(import.meta.dirname, '..', '..', ...segments);
}

function writeJson(filePath: string, value: unknown): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createSourceConfigFiles(workDir: string): string[] {
	const configs = [
		{
			id: 'markdown-main',
			kind: 'filesystem',
			path: repoPath('fixtures', 'stage7', 'markdown'),
		},
		{
			id: 'conversation-main',
			kind: 'filesystem',
			mode: 'session',
			path: repoPath('fixtures', 'stage7', 'conversations'),
		},
		{
			id: 'code-main',
			kind: 'git',
			mode: 'repo',
			path: repoPath('fixtures', 'stage7', 'code'),
		},
		{
			id: 'synthetic-main',
			kind: 'documents',
			mode: 'documents',
			path: repoPath('fixtures', 'stage7', 'synthetic'),
		},
	] as const;

	return configs.map((config) => {
		const filePath = path.join(workDir, `${config.id}.json`);
		fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
		return filePath;
	});
}

async function runStage7(mode: ReportMode) {
	const diagnosticsDir = repoPath('.tmp', 'diagnostics');
	const stateDir = createTempDir();
	const workDir = createTempDir();
	const statePaths = resolveDiagnosticsPaths(stateDir);
	const client = new Stage7FakeClient();
	const daemon = createSyncDaemon({
		clientFactory: () => client as never,
		hostConfig: {},
		statePaths,
	});
	const runtime = new MemoryRuntimeService(client);

	try {
		for (const configPath of createSourceConfigFiles(workDir)) {
			daemon.addSourceFromFile(configPath);
		}

		const ingestStartedAt = performance.now();
		const ingestResult = await daemon.runOnce({
			reason: 'scheduled-sync',
		});
		const ingestDurationMs = Math.max(0, performance.now() - ingestStartedAt);
		const steadyStateResult = await daemon.runOnce({
			reason: 'scheduled-sync',
		});

		await runtime.search({
			query: 'backend seam durable source truth',
			tokenBudget: 1200,
		});
		await runtime.search({
			query: 'what was the saffron ramen phrase from the old session recall log',
			tokenBudget: 1200,
		});
		await runtime.index({
			reason: 'cache-refresh',
			target: 'runtime',
		});
		const status = await runtime.status();

		const artifacts = client.getArtifacts();
		const report = {
			generatedAt: new Date().toISOString(),
			mode,
			statusClassification:
				status.cache.stale === true &&
				status.diagnostics.rankingProfile === 'v2' &&
				ingestResult.refreshIds.length > 0 &&
				steadyStateResult.refreshIds.length === 0
					? 'validated'
					: 'blocked',
			metrics: {
				artifactsPromoted: ingestResult.artifactsPromoted,
				duplicateResultsCollapsed:
					status.diagnostics.duplicateResultsCollapsed,
				duplicatesAvoidedDuringRun: ingestResult.duplicatesAvoided,
				filesSkippedOnSteadyState: steadyStateResult.filesSkipped,
				ingestDurationMs,
				keywordFallbackApplied: status.diagnostics.keywordFallbackApplied,
				lastRefreshLatencyMs: status.diagnostics.lastRefreshLatencyMs ?? 0,
				lastSearchLatencyMs: status.diagnostics.lastSearchLatencyMs ?? 0,
				refreshCount: client.getRefreshCount(),
				throughputArtifactsPerSecond:
					ingestDurationMs === 0
						? ingestResult.artifactsPromoted
						: Number(
								(
									ingestResult.artifactsPromoted /
									(ingestDurationMs / 1000)
								).toFixed(2),
							),
			},
			mitigations: {
				badClassification: artifacts.some(
					(artifact) =>
						artifact.metadata?.classificationReason !== undefined &&
						artifact.metadata?.classificationConfidence !== undefined,
				),
				contextPollution:
					artifacts.some((artifact) => artifact.classification === 'conversation') &&
					artifacts.some((artifact) => artifact.classification === 'decision'),
				duplicateIngestion:
					steadyStateResult.artifactsPromoted === 0 &&
					steadyStateResult.refreshIds.length === 0,
				hooksAreNotRecall:
					fs
						.readFileSync(
							repoPath('fixtures', 'stage7', 'synthetic', 'hooks-warning.txt'),
							'utf8',
						)
						.includes('not the main pre-reply recall mechanism'),
				slowRecall:
					(status.diagnostics.lastSearchLatencyMs ?? Number.POSITIVE_INFINITY) <
					1000,
			},
			samples: {
				cache: status.cache,
				diagnostics: status.diagnostics,
				firstArtifacts: artifacts.slice(0, 4).map((artifact) => ({
					artifactId: artifact.artifactId,
					classification: artifact.classification,
					metadata: artifact.metadata,
					source: artifact.source,
				})),
				steadyStateRun: steadyStateResult,
			},
		};

		const outputFile = path.join(
			diagnosticsDir,
			mode === 'diagnostic'
				? 'stage7-diagnostic.json'
				: 'stage7-benchmark.json',
		);
		writeJson(outputFile, report);
		console.log(JSON.stringify(report, null, 2));
	} finally {
		daemon.close();
		await runtime.close();
		fs.rmSync(stateDir, { force: true, recursive: true });
		fs.rmSync(workDir, { force: true, recursive: true });
	}
}

const mode = (process.argv[2] as ReportMode | undefined) ?? 'diagnostic';
if (mode !== 'diagnostic' && mode !== 'benchmark') {
	throw new Error(`Unsupported stage7 mode: ${mode}`);
}

await runStage7(mode);
