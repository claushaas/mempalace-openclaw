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
} from '@mempalace-openclaw/shared';
import {
	createFingerprint,
	createVersionedHookEnvelope,
	type SourceConfig,
	type SyncJob,
} from '@mempalace-openclaw/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { RuntimeRefreshRow } from '../db/store.js';
import { writePendingSpoolRecord } from '../spool/records.js';
import { createSyncDaemon } from './sync-daemon.js';

class FakeMemPalaceClient {
	public readonly artifacts: MemoryArtifact[] = [];

	public readonly refreshes: MemoryIndexRequest[] = [];

	public async close(): Promise<void> {}

	public async get(artifactId: string): Promise<MemoryArtifact> {
		const artifact = this.artifacts.find(
			(entry) => entry.artifactId === artifactId,
		);
		if (!artifact) {
			throw new Error(`Missing artifact ${artifactId}`);
		}
		return artifact;
	}

	public async getHealth(): Promise<RuntimeHealth> {
		return {
			backendReachable: true,
			status: 'ready',
		};
	}

	public async listSourcesStatus(): Promise<SourceStatus[]> {
		return [];
	}

	public async promote(input: MemoryPromoteInput): Promise<MemoryArtifact> {
		const artifact: MemoryArtifact = {
			artifactId: input.artifactId ?? `artifact-${this.artifacts.length + 1}`,
			classification: input.classification,
			content: input.content ?? '',
			memoryType: input.memoryType,
			source: input.source,
			sourcePath: input.sourcePath ?? '/unknown',
			sourceType: 'filesystem',
			updatedAt: new Date().toISOString(),
			...(input.agentId ? { agentId: input.agentId } : {}),
			...(input.sessionId ? { sessionId: input.sessionId } : {}),
		};
		this.artifacts.push(artifact);
		return artifact;
	}

	public async refreshIndex(request: MemoryIndexRequest): Promise<void> {
		this.refreshes.push(request);
	}

	public async search(
		_query: MemorySearchQuery,
	): Promise<MemorySearchResult[]> {
		return [];
	}
}

class FakeSyncDatabase {
	private readonly errors: Array<{ errorMessage: string; jobId: string }> = [];

	private readonly files = new Map<
		string,
		{ hash: string; last_ingested_at: string }
	>();

	private readonly jobs: SyncJob[] = [];

	private readonly refreshes: RuntimeRefreshRow[] = [];

	private readonly sources = new Map<
		string,
		SourceConfig & { enabled: boolean }
	>();

	public addError(jobId: string, errorMessage: string): void {
		this.errors.push({ errorMessage, jobId });
	}

	public close(): void {}

	public deleteSource(sourceId: string): boolean {
		return this.sources.delete(sourceId);
	}

	public finishJob(jobId: string, status: 'completed' | 'failed'): void {
		const job = this.jobs.find((entry) => entry.jobId === jobId);
		if (!job) {
			return;
		}
		job.status = status;
		job.finishedAt = new Date().toISOString();
	}

	public getFileRecord(
		pathValue: string,
	): { hash: string; last_ingested_at: string } | undefined {
		return this.files.get(pathValue);
	}

	public getLatestRefresh(): RuntimeRefreshRow | undefined {
		return this.refreshes
			.toSorted((left, right) =>
				right.triggered_at.localeCompare(left.triggered_at),
			)
			.at(0);
	}

	public getLatestSourceJob(sourceId: string): SyncJob | undefined {
		return this.jobs
			.filter((entry) => entry.sourceId === sourceId)
			.toSorted((left, right) => right.startedAt.localeCompare(left.startedAt))
			.at(0);
	}

	public hasAnyPendingSpoolFiles(): boolean {
		return [...this.files.keys()].some((entry) => entry.startsWith('spool:'));
	}

	public insertRefresh(params: {
		id: string;
		reason: string;
		status: string;
		triggeredAt: string;
	}): void {
		this.refreshes.push({
			completed_at: null,
			id: params.id,
			reason: params.reason,
			status: params.status,
			triggered_at: params.triggeredAt,
		});
	}

	public listJobs(): SyncJob[] {
		return this.jobs.toSorted((left, right) =>
			right.startedAt.localeCompare(left.startedAt),
		);
	}

	public listSources(): Array<SourceConfig & { enabled: boolean }> {
		return [...this.sources.values()].toSorted((left, right) =>
			left.id.localeCompare(right.id),
		);
	}

	public markRefreshCompleted(
		refreshId: string,
		status: 'completed' | 'failed',
	): void {
		const refresh = this.refreshes.find((entry) => entry.id === refreshId);
		if (!refresh) {
			return;
		}
		refresh.completed_at = new Date().toISOString();
		refresh.status = status;
	}

	public recordFile(pathValue: string, hash: string): void {
		this.files.set(pathValue, {
			hash,
			last_ingested_at: new Date().toISOString(),
		});
	}

	public startJob(sourceId: string): SyncJob {
		const startedAt = new Date().toISOString();
		const job: SyncJob = {
			jobId: `${sourceId}-${startedAt.replace(/[:.]/g, '-')}`,
			sourceId,
			startedAt,
			status: 'running',
		};
		this.jobs.push(job);
		return job;
	}

	public upsertSource(config: SourceConfig): void {
		this.sources.set(config.id, { ...config, enabled: true });
	}
}

const tempDirs: string[] = [];

function createTempDir(): string {
	const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-daemon-stage6-'));
	tempDirs.push(dirPath);
	return dirPath;
}

function createStatePaths(baseDir: string) {
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

afterEach(() => {
	for (const dirPath of tempDirs.splice(0)) {
		fs.rmSync(dirPath, { force: true, recursive: true });
	}
});

describe('SyncDaemon', () => {
	it('adds, lists and removes source configs through sync.db', () => {
		const baseDir = createTempDir();
		const sourceConfigPath = path.join(baseDir, 'source.json');
		fs.writeFileSync(
			sourceConfigPath,
			JSON.stringify(
				{
					id: 'notes',
					kind: 'filesystem',
					path: path.join(baseDir, 'docs'),
				},
				null,
				2,
			),
		);

		const client = new FakeMemPalaceClient();
		const daemon = createSyncDaemon({
			clientFactory: () => client as never,
			db: new FakeSyncDatabase() as never,
			hostConfig: {},
			statePaths: createStatePaths(baseDir),
		});
		try {
			const source = daemon.addSourceFromFile(sourceConfigPath);
			expect(source.id).toBe('notes');
			expect(daemon.listSources()).toHaveLength(1);
			expect(daemon.removeSource('notes')).toBe(true);
			expect(daemon.listSources()).toHaveLength(0);
		} finally {
			daemon.close();
		}
	});

	it('runs filesystem ingestion and spool cutover with refresh tracking', async () => {
		const baseDir = createTempDir();
		const docsDir = path.join(baseDir, 'docs');
		fs.mkdirSync(docsDir, { recursive: true });
		fs.writeFileSync(
			path.join(docsDir, 'qa.md'),
			'# QA Notes\n\nDecision: movie night snack is lemon pepper wings.\n',
		);

		const sourceConfigPath = path.join(baseDir, 'source.json');
		fs.writeFileSync(
			sourceConfigPath,
			JSON.stringify(
				{
					id: 'docs-main',
					include: ['**/*.md'],
					kind: 'filesystem',
					path: docsDir,
				},
				null,
				2,
			),
		);

		const statePaths = createStatePaths(baseDir);
		const client = new FakeMemPalaceClient();
		const daemon = createSyncDaemon({
			clientFactory: () => client as never,
			db: new FakeSyncDatabase() as never,
			hostConfig: {},
			statePaths,
		});
		try {
			daemon.addSourceFromFile(sourceConfigPath);
			writePendingSpoolRecord(statePaths, {
				envelope: createVersionedHookEnvelope({
					agentId: 'main',
					event: 'command:new',
					idempotencyKey: createFingerprint({ a: 1 }),
					payload: {
						snapshot: 'session payload',
					},
					sessionId: 'session-1',
					timestamp: new Date().toISOString(),
				}),
				hookSource: 'host-event',
				processingState: 'pending',
				sourceFingerprint: createFingerprint({ b: 2 }),
				writtenAt: new Date().toISOString(),
			});

			const result = await daemon.runOnce();
			expect(result.artifactsPromoted).toBeGreaterThanOrEqual(2);
			expect(result.duplicatesAvoided).toBe(0);
			expect(result.refreshIds.length).toBeGreaterThanOrEqual(2);
			expect(
				client.artifacts.some((artifact) => artifact.source === 'docs-main'),
			).toBe(true);
			expect(
				client.artifacts.some(
					(artifact) => artifact.source === 'openclaw-hook-pack',
				),
			).toBe(true);
			expect(fs.readdirSync(statePaths.processedSpoolDir).length).toBe(1);
			expect(fs.readdirSync(statePaths.pendingSpoolDir).length).toBe(0);
		} finally {
			daemon.close();
		}
	});

	it('skips refresh when no source or spool changes are detected', async () => {
		const baseDir = createTempDir();
		const docsDir = path.join(baseDir, 'docs');
		fs.mkdirSync(docsDir, { recursive: true });
		fs.writeFileSync(
			path.join(docsDir, 'qa.md'),
			'# QA Notes\n\nDecision: movie night snack is lemon pepper wings.\n',
		);
		const sourceConfigPath = path.join(baseDir, 'source.json');
		fs.writeFileSync(
			sourceConfigPath,
			JSON.stringify(
				{
					id: 'docs-main',
					include: ['**/*.md'],
					kind: 'filesystem',
					path: docsDir,
				},
				null,
				2,
			),
		);

		const statePaths = createStatePaths(baseDir);
		const client = new FakeMemPalaceClient();
		const daemon = createSyncDaemon({
			clientFactory: () => client as never,
			db: new FakeSyncDatabase() as never,
			hostConfig: {},
			statePaths,
		});
		try {
			daemon.addSourceFromFile(sourceConfigPath);
			const firstRun = await daemon.runOnce();
			const secondRun = await daemon.runOnce();

			expect(firstRun.refreshIds.length).toBeGreaterThan(0);
			expect(secondRun.artifactsPromoted).toBe(0);
			expect(secondRun.refreshIds).toHaveLength(0);
		} finally {
			daemon.close();
		}
	});

	it('avoids promoting duplicate chunk fingerprints within the same run', async () => {
		const baseDir = createTempDir();
		const docsDir = path.join(baseDir, 'docs');
		fs.mkdirSync(docsDir, { recursive: true });
		const repeatedContent =
			'Decision: runtime refresh must be aggregated, not fired per promoted chunk.\n';
		fs.writeFileSync(path.join(docsDir, 'a.md'), repeatedContent);
		fs.writeFileSync(path.join(docsDir, 'b.md'), repeatedContent);
		const sourceConfigPath = path.join(baseDir, 'source.json');
		fs.writeFileSync(
			sourceConfigPath,
			JSON.stringify(
				{
					id: 'docs-main',
					include: ['**/*.md'],
					kind: 'filesystem',
					path: docsDir,
				},
				null,
				2,
			),
		);

		const statePaths = createStatePaths(baseDir);
		const client = new FakeMemPalaceClient();
		const daemon = createSyncDaemon({
			clientFactory: () => client as never,
			db: new FakeSyncDatabase() as never,
			hostConfig: {},
			statePaths,
		});
		try {
			daemon.addSourceFromFile(sourceConfigPath);
			const result = await daemon.runOnce();

			expect(result.artifactsPromoted).toBe(1);
			expect(result.duplicatesAvoided).toBeGreaterThanOrEqual(1);
		} finally {
			daemon.close();
		}
	});
});
