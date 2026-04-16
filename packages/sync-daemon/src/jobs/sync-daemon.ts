import fs from 'node:fs';

import {
	createFingerprint,
	type MemoryPromoteInput,
	MemoryPromoteInputSchema,
	parseWithSchema,
	type SourceConfig,
	SourceConfigSchema,
	SourceNotFoundError,
} from '@mempalace-openclaw/shared';

import { SyncDaemonMemPalaceClient } from '../client/mcp-stdio-client.js';
import { resolveMemoryBackendConfig } from '../config/runtime.js';
import { resolveSyncStatePaths, type SyncStatePaths } from '../config/state.js';
import { SyncDatabase } from '../db/store.js';
import { triggerRuntimeRefresh } from '../runtime-refresh/refresh.js';
import { isScheduleDue } from '../scheduler/cron.js';
import {
	prepareSourceChunks,
	promoteChunks,
	readSourceCandidateContent,
} from '../sources/pipeline.js';
import { scanSource } from '../sources/scanner.js';
import {
	ensureSpoolDirs,
	listPendingSpoolFiles,
	markSpoolRecordFailed,
	markSpoolRecordProcessed,
	readSpoolRecord,
	type SpoolRecord,
} from '../spool/records.js';

type Logger = {
	debug(message: string, payload?: Record<string, unknown>): void;
	error(message: string, payload?: Record<string, unknown>): void;
	info(message: string, payload?: Record<string, unknown>): void;
	warn(message: string, payload?: Record<string, unknown>): void;
};

type CreateSyncDaemonOptions = {
	clientFactory?: (cfg: unknown) => SyncDaemonMemPalaceClient;
	hostConfig: unknown;
	logger?: Logger;
	statePaths?: SyncStatePaths;
};

type RunSyncResult = {
	artifactsPromoted: number;
	duplicatesAvoided: number;
	filesSkipped: number;
	filesVisited: number;
	jobs: string[];
	refreshIds: string[];
};

const DEFAULT_LOGGER: Logger = {
	debug() {},
	error() {},
	info() {},
	warn() {},
};

function appendDaemonEvidence(
	statePaths: SyncStatePaths,
	event: string,
	payload?: Record<string, unknown>,
): void {
	const resultsDir = process.env.OPENCLAW_HOST_REAL_RESULTS_DIR?.trim();
	const entry = {
		event,
		payload,
		recordedAt: new Date().toISOString(),
	};
	const line = `${JSON.stringify(entry)}\n`;
	fs.mkdirSync(statePaths.logsDir, { recursive: true });
	fs.appendFileSync(`${statePaths.logsDir}/sync-daemon.jsonl`, line);
	if (resultsDir) {
		fs.mkdirSync(resultsDir, { recursive: true });
		fs.appendFileSync(`${resultsDir}/sync-daemon.jsonl`, line);
	}
}

function loadSourceConfigFromFile(configPath: string): SourceConfig {
	return parseWithSchema(
		SourceConfigSchema,
		JSON.parse(fs.readFileSync(configPath, 'utf8')),
		'Invalid source config file.',
	);
}

function resolveSpoolPromoteInput(record: SpoolRecord): MemoryPromoteInput {
	if (record.envelope.event === 'milestone') {
		const payload =
			record.envelope.payload &&
			typeof record.envelope.payload === 'object' &&
			!Array.isArray(record.envelope.payload)
				? record.envelope.payload
				: {};
		return parseWithSchema(
			MemoryPromoteInputSchema,
			{
				agentId: record.envelope.agentId,
				artifactId:
					typeof payload.artifactId === 'string'
						? payload.artifactId
						: undefined,
				classification:
					payload.classification === 'decision' ||
					payload.classification === 'problem' ||
					payload.classification === 'artifact' ||
					payload.classification === 'conversation'
						? payload.classification
						: 'milestone',
				content:
					typeof payload.content === 'string'
						? payload.content
						: `Milestone captured for ${record.envelope.sessionId}`,
				memoryType:
					payload.memoryType === 'facts' ||
					payload.memoryType === 'discoveries' ||
					payload.memoryType === 'preferences' ||
					payload.memoryType === 'advice'
						? payload.memoryType
						: 'events',
				metadata: {
					hookSource: record.hookSource,
					sourceFingerprint: record.sourceFingerprint,
				},
				sessionId: record.envelope.sessionId,
				source: 'openclaw-hook-pack',
				sourcePath: `/hooks/milestones/${record.envelope.sessionId}.md`,
			},
			'Invalid spool milestone promote input.',
		);
	}

	return parseWithSchema(
		MemoryPromoteInputSchema,
		{
			agentId: record.envelope.agentId,
			artifactId: `session-${record.envelope.sessionId}-${record.sourceFingerprint.slice(0, 12)}`,
			classification: 'conversation',
			content: JSON.stringify(record.envelope.payload, null, 2),
			memoryType: 'events',
			metadata: {
				hookSource: record.hookSource,
				sourceFingerprint: record.sourceFingerprint,
			},
			sessionId: record.envelope.sessionId,
			source: 'openclaw-hook-pack',
			sourcePath: `/sessions/${record.envelope.sessionId}/${record.envelope.event}.json`,
		},
		'Invalid spool session promote input.',
	);
}

function migrateLegacySpool(paths: SyncStatePaths): void {
	ensureSpoolDirs(paths);
	if (
		!fs.existsSync(paths.legacySpoolDir) ||
		paths.legacySpoolDir === paths.spoolBaseDir
	) {
		return;
	}

	const currentEntries = listPendingSpoolFiles(paths);
	if (currentEntries.length > 0) {
		return;
	}

	const legacyPendingDir = `${paths.legacySpoolDir}/pending`;
	if (!fs.existsSync(legacyPendingDir)) {
		return;
	}

	for (const entry of fs
		.readdirSync(legacyPendingDir)
		.filter((file) => file.endsWith('.json'))) {
		fs.copyFileSync(
			`${legacyPendingDir}/${entry}`,
			`${paths.pendingSpoolDir}/${entry}`,
		);
	}
}

export class SyncDaemon {
	private readonly clientFactory: (cfg: unknown) => SyncDaemonMemPalaceClient;

	private readonly db: SyncDatabase;

	private readonly hostConfig: unknown;

	private readonly logger: Logger;

	private readonly statePaths: SyncStatePaths;

	public constructor(options: CreateSyncDaemonOptions) {
		this.clientFactory =
			options.clientFactory ??
			((cfg) => new SyncDaemonMemPalaceClient(resolveMemoryBackendConfig(cfg)));
		this.db = new SyncDatabase(
			(options.statePaths ?? resolveSyncStatePaths()).dbPath,
		);
		this.hostConfig = options.hostConfig;
		this.logger = options.logger ?? DEFAULT_LOGGER;
		this.statePaths = options.statePaths ?? resolveSyncStatePaths();
		ensureSpoolDirs(this.statePaths);
		migrateLegacySpool(this.statePaths);
	}

	public close(): void {
		this.db.close();
	}

	public addSourceFromFile(configPath: string): SourceConfig {
		const sourceConfig = loadSourceConfigFromFile(configPath);
		this.db.upsertSource(sourceConfig);
		appendDaemonEvidence(this.statePaths, 'source.added', {
			configPath,
			sourceId: sourceConfig.id,
		});
		return sourceConfig;
	}

	public listSources(
		enabledOnly = false,
	): Array<SourceConfig & { enabled: boolean }> {
		return this.db
			.listSources()
			.filter((source) => (enabledOnly ? source.enabled : true));
	}

	public removeSource(sourceId: string): boolean {
		const removed = this.db.deleteSource(sourceId);
		if (!removed) {
			throw new SourceNotFoundError(sourceId);
		}
		appendDaemonEvidence(this.statePaths, 'source.removed', { sourceId });
		return true;
	}

	public status(sourceId?: string): {
		jobs: ReturnType<SyncDaemon['listJobs']>;
		lastRefresh?: ReturnType<SyncDatabase['getLatestRefresh']>;
		spool: { failed: number; pending: number; processed: number };
		sources: Array<SourceConfig & { enabled: boolean }>;
	} {
		const sources = this.listSources().filter((entry) =>
			sourceId ? entry.id === sourceId : true,
		);
		return {
			jobs: this.listJobs(sourceId),
			lastRefresh: this.db.getLatestRefresh(),
			sources,
			spool: {
				failed: fs.existsSync(this.statePaths.failedSpoolDir)
					? fs.readdirSync(this.statePaths.failedSpoolDir).length
					: 0,
				pending: listPendingSpoolFiles(this.statePaths).length,
				processed: fs.existsSync(this.statePaths.processedSpoolDir)
					? fs.readdirSync(this.statePaths.processedSpoolDir).length
					: 0,
			},
		};
	}

	public listJobs(sourceId?: string) {
		return this.db
			.listJobs()
			.filter((entry) => (sourceId ? entry.sourceId === sourceId : true));
	}

	public async processSpool(): Promise<{
		duplicatesAvoided: number;
		processed: number;
		refreshIds: string[];
	}> {
		const pendingFiles = listPendingSpoolFiles(this.statePaths);
		if (pendingFiles.length === 0) {
			return { duplicatesAvoided: 0, processed: 0, refreshIds: [] };
		}

		const client = this.clientFactory(this.hostConfig);
		const refreshIds: string[] = [];
		let duplicatesAvoided = 0;
		let processed = 0;
		try {
			const job = this.db.startJob('spool');
			const promotedArtifactIds: string[] = [];
			for (const filePath of pendingFiles) {
				const record = readSpoolRecord(filePath);
				const logicalPath = `spool:${record.sourceFingerprint}`;
				const known = this.db.getFileRecord(logicalPath);
				if (known?.hash === record.sourceFingerprint) {
					duplicatesAvoided += 1;
					markSpoolRecordProcessed(this.statePaths, filePath, record, {
						deduped: true,
					});
					continue;
				}

				try {
					const artifact = await client.promote(
						resolveSpoolPromoteInput(record),
					);
					this.db.recordFile(logicalPath, record.sourceFingerprint);
					promotedArtifactIds.push(artifact.artifactId);
					markSpoolRecordProcessed(this.statePaths, filePath, record, {
						artifactId: artifact.artifactId,
					});
					processed += 1;
					appendDaemonEvidence(this.statePaths, 'spool.record.processed', {
						artifactId: artifact.artifactId,
						filePath,
					});
				} catch (error) {
					this.db.addError(
						job.jobId,
						error instanceof Error ? error.message : String(error),
					);
					markSpoolRecordFailed(this.statePaths, filePath, record, error);
					appendDaemonEvidence(this.statePaths, 'spool.record.failed', {
						error: error instanceof Error ? error.message : String(error),
						filePath,
					});
				}
			}
			if (processed > 0) {
				const refresh = await triggerRuntimeRefresh({
					client,
					db: this.db,
					reason: 'post-ingest',
					sourceId: 'spool',
				});
				refreshIds.push(refresh.refreshId);
				appendDaemonEvidence(this.statePaths, 'spool.refresh.completed', {
					artifactIds: promotedArtifactIds,
					refreshId: refresh.refreshId,
				});
			}
			this.db.finishJob(job.jobId, 'completed');
			return { duplicatesAvoided, processed, refreshIds };
		} catch (error) {
			this.logger.error('sync-daemon spool processing failed', {
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		} finally {
			await client.close();
		}
	}

	public async reindex(
		sourceId?: string,
		force = false,
	): Promise<RunSyncResult> {
		return this.runOnce({
			...(force ? { force } : {}),
			reason: 'manual-reindex',
			...(sourceId ? { sourceId } : {}),
		});
	}

	public async runScheduled(now = new Date()): Promise<RunSyncResult> {
		const dueSources = this.listSources(true)
			.filter((source) => source.schedule)
			.filter((source) => isScheduleDue(source.schedule ?? '', now))
			.map((source) => source.id);

		if (dueSources.length === 0) {
			return {
				artifactsPromoted: 0,
				duplicatesAvoided: 0,
				filesSkipped: 0,
				filesVisited: 0,
				jobs: [],
				refreshIds: [],
			};
		}

		let summary: RunSyncResult = {
			artifactsPromoted: 0,
			duplicatesAvoided: 0,
			filesSkipped: 0,
			filesVisited: 0,
			jobs: [],
			refreshIds: [],
		};
		for (const candidateSourceId of dueSources) {
			const result = await this.runOnce({
				reason: 'scheduled-sync',
				sourceId: candidateSourceId,
			});
			summary = {
				artifactsPromoted: summary.artifactsPromoted + result.artifactsPromoted,
				duplicatesAvoided: summary.duplicatesAvoided + result.duplicatesAvoided,
				filesSkipped: summary.filesSkipped + result.filesSkipped,
				filesVisited: summary.filesVisited + result.filesVisited,
				jobs: [...summary.jobs, ...result.jobs],
				refreshIds: [...summary.refreshIds, ...result.refreshIds],
			};
		}
		return summary;
	}

	public async runOnce(params?: {
		force?: boolean;
		reason?: 'manual-reindex' | 'post-ingest' | 'scheduled-sync';
		sourceId?: string;
	}): Promise<RunSyncResult> {
		const reason = params?.reason ?? 'scheduled-sync';
		const spoolResult = await this.processSpool();
		const sources = this.listSources(true).filter((source) =>
			params?.sourceId
				? source.id === params.sourceId
				: source.kind !== 'spool',
		);

		if (params?.sourceId && sources.length === 0) {
			throw new SourceNotFoundError(params.sourceId);
		}

		const client = this.clientFactory(this.hostConfig);
		const refreshIds = [...spoolResult.refreshIds];
		let artifactsPromoted = spoolResult.processed;
		let duplicatesAvoided = spoolResult.duplicatesAvoided;
		let filesSkipped = 0;
		let filesVisited = 0;
		const jobs: string[] = [];

		try {
			for (const source of sources) {
				const job = this.db.startJob(source.id);
				jobs.push(job.jobId);
				try {
					const candidates = await scanSource(source);
					let sourceArtifactsPromoted = 0;
					const seenRunChunkFingerprints = new Set<string>();
					for (const candidate of candidates) {
						filesVisited += 1;
						const content = readSourceCandidateContent(candidate.absolutePath);
						const sourceHash = createFingerprint({
							content,
							path: candidate.logicalPath,
						});
						const cached = this.db.getFileRecord(candidate.logicalPath);
						if (!params?.force && cached?.hash === sourceHash) {
							filesSkipped += 1;
							continue;
						}

						const chunks = prepareSourceChunks({
							content,
							logicalPath: candidate.logicalPath,
							relativePath: candidate.relativePath,
							source,
						});
						const uniqueChunks: ReturnType<typeof prepareSourceChunks> = [];
						for (const chunk of chunks) {
							if (seenRunChunkFingerprints.has(chunk.fingerprint)) {
								duplicatesAvoided += 1;
								continue;
							}
							seenRunChunkFingerprints.add(chunk.fingerprint);
							uniqueChunks.push(chunk);
						}
						if (uniqueChunks.length === 0) {
							continue;
						}
						const artifacts = await promoteChunks({
							chunks: uniqueChunks,
							client,
							source,
						});
						artifactsPromoted += artifacts.length;
						sourceArtifactsPromoted += artifacts.length;
						this.db.recordFile(candidate.logicalPath, sourceHash);
						appendDaemonEvidence(this.statePaths, 'source.file.promoted', {
							artifactIds: artifacts.map((artifact) => artifact.artifactId),
							duplicatesAvoided,
							logicalPath: candidate.logicalPath,
							sourceId: source.id,
						});
					}

					if (sourceArtifactsPromoted > 0) {
						const refresh = await triggerRuntimeRefresh({
							client,
							db: this.db,
							...(params?.force !== undefined ? { force: params.force } : {}),
							reason,
							sourceId: source.id,
						});
						refreshIds.push(refresh.refreshId);
					}
					this.db.finishJob(job.jobId, 'completed');
				} catch (error) {
					this.db.addError(
						job.jobId,
						error instanceof Error ? error.message : String(error),
					);
					this.db.finishJob(job.jobId, 'failed');
					throw error;
				}
			}

			return {
				artifactsPromoted,
				duplicatesAvoided,
				filesSkipped,
				filesVisited,
				jobs,
				refreshIds,
			};
		} finally {
			await client.close();
		}
	}
}

export function createSyncDaemon(options: CreateSyncDaemonOptions): SyncDaemon {
	return new SyncDaemon({
		...options,
		statePaths: options.statePaths ?? resolveSyncStatePaths(),
	});
}
