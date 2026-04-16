import fs from 'node:fs';
import path from 'node:path';
import {
	parseWithSchema,
	type SourceConfig,
	SourceConfigSchema,
	type SyncJob,
	SyncJobSchema,
} from '@mempalace-openclaw/shared';
import Database from 'better-sqlite3';

export type SourceRow = {
	config: string;
	enabled: number;
	id: string;
	path: string;
	type: string;
};

export type RuntimeRefreshRow = {
	completed_at: string | null;
	id: string;
	reason: string;
	status: string;
	triggered_at: string;
};

export class SyncDatabase {
	private readonly db: Database.Database;

	public constructor(dbPath: string) {
		fs.mkdirSync(path.dirname(dbPath), { recursive: true });
		this.db = new Database(dbPath);
		this.db.pragma('journal_mode = WAL');
		this.migrate();
	}

	public close(): void {
		this.db.close();
	}

	public addError(jobId: string, errorMessage: string): void {
		this.db
			.prepare(
				`INSERT INTO errors (job_id, error_message)
         VALUES (?, ?)`,
			)
			.run(jobId, errorMessage);
	}

	public deleteSource(sourceId: string): boolean {
		const result = this.db
			.prepare('DELETE FROM sources WHERE id = ?')
			.run(sourceId);
		return result.changes > 0;
	}

	public finishJob(jobId: string, status: 'completed' | 'failed'): void {
		this.db
			.prepare(
				`UPDATE jobs
         SET status = ?, finished_at = ?
         WHERE id = ?`,
			)
			.run(status, new Date().toISOString(), jobId);
	}

	public getFileRecord(
		pathValue: string,
	): { hash: string; last_ingested_at: string } | undefined {
		return this.db
			.prepare('SELECT path, hash, last_ingested_at FROM files WHERE path = ?')
			.get(pathValue) as { hash: string; last_ingested_at: string } | undefined;
	}

	public getLatestRefresh(): RuntimeRefreshRow | undefined {
		return this.db
			.prepare(
				`SELECT id, reason, triggered_at, completed_at, status
         FROM runtime_refresh
         ORDER BY triggered_at DESC
         LIMIT 1`,
			)
			.get() as RuntimeRefreshRow | undefined;
	}

	public getLatestSourceJob(sourceId: string): SyncJob | undefined {
		const row = this.db
			.prepare(
				`SELECT id, source_id, status, started_at, finished_at
         FROM jobs
         WHERE source_id = ?
         ORDER BY started_at DESC
         LIMIT 1`,
			)
			.get(sourceId) as
			| {
					finished_at: string | null;
					id: string;
					source_id: string;
					started_at: string;
					status: string;
			  }
			| undefined;
		if (!row) {
			return undefined;
		}

		return parseWithSchema(
			SyncJobSchema,
			{
				finishedAt: row.finished_at ?? undefined,
				jobId: row.id,
				sourceId: row.source_id,
				startedAt: row.started_at,
				status: row.status,
			},
			'Invalid sync job row.',
		);
	}

	public hasAnyPendingSpoolFiles(): boolean {
		const row = this.db
			.prepare(`SELECT COUNT(*) AS count FROM files WHERE path LIKE 'spool:%'`)
			.get() as { count: number };
		return row.count > 0;
	}

	public insertRefresh(params: {
		id: string;
		reason: string;
		status: string;
		triggeredAt: string;
	}): void {
		this.db
			.prepare(
				`INSERT INTO runtime_refresh (id, reason, triggered_at, completed_at, status)
         VALUES (?, ?, ?, NULL, ?)`,
			)
			.run(params.id, params.reason, params.triggeredAt, params.status);
	}

	public listJobs(): SyncJob[] {
		const rows = this.db
			.prepare(
				`SELECT id, source_id, status, started_at, finished_at
         FROM jobs
         ORDER BY started_at DESC`,
			)
			.all() as Array<{
			finished_at: string | null;
			id: string;
			source_id: string;
			started_at: string;
			status: string;
		}>;
		return rows.map((row) =>
			parseWithSchema(
				SyncJobSchema,
				{
					finishedAt: row.finished_at ?? undefined,
					jobId: row.id,
					sourceId: row.source_id,
					startedAt: row.started_at,
					status: row.status,
				},
				'Invalid sync job row.',
			),
		);
	}

	public listSources(): Array<SourceConfig & { enabled: boolean }> {
		const rows = this.db
			.prepare(
				'SELECT id, type, path, config, enabled FROM sources ORDER BY id ASC',
			)
			.all() as SourceRow[];
		return rows.map((row) => ({
			...parseWithSchema(
				SourceConfigSchema,
				JSON.parse(row.config),
				'Invalid stored source config.',
			),
			enabled: row.enabled === 1,
		}));
	}

	public markRefreshCompleted(
		refreshId: string,
		status: 'completed' | 'failed',
	): void {
		this.db
			.prepare(
				`UPDATE runtime_refresh
         SET completed_at = ?, status = ?
         WHERE id = ?`,
			)
			.run(new Date().toISOString(), status, refreshId);
	}

	public recordFile(pathValue: string, hash: string): void {
		this.db
			.prepare(
				`INSERT INTO files (path, hash, last_ingested_at)
         VALUES (?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           hash = excluded.hash,
           last_ingested_at = excluded.last_ingested_at`,
			)
			.run(pathValue, hash, new Date().toISOString());
	}

	public startJob(sourceId: string): SyncJob {
		const startedAt = new Date().toISOString();
		const jobId = `${sourceId}-${startedAt.replace(/[:.]/g, '-')}`;
		this.db
			.prepare(
				`INSERT INTO jobs (id, source_id, status, started_at, finished_at)
         VALUES (?, ?, 'running', ?, NULL)`,
			)
			.run(jobId, sourceId, startedAt);

		return parseWithSchema(
			SyncJobSchema,
			{
				jobId,
				sourceId,
				startedAt,
				status: 'running',
			},
			'Invalid running sync job.',
		);
	}

	public upsertSource(config: SourceConfig): void {
		this.db
			.prepare(
				`INSERT INTO sources (id, type, path, config, enabled)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET
           type = excluded.type,
           path = excluded.path,
           config = excluded.config,
           enabled = excluded.enabled`,
			)
			.run(config.id, config.kind, config.path, JSON.stringify(config));
	}

	private migrate(): void {
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        path TEXT NOT NULL,
        config TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT NULL
      );

      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        last_ingested_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS errors (
        job_id TEXT NOT NULL,
        error_message TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runtime_refresh (
        id TEXT PRIMARY KEY,
        reason TEXT NOT NULL,
        triggered_at TEXT NOT NULL,
        completed_at TEXT NULL,
        status TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_id ON sources (id);
      CREATE INDEX IF NOT EXISTS idx_jobs_source_status_started_at ON jobs (source_id, status, started_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_files_path ON files (path);
      CREATE INDEX IF NOT EXISTS idx_files_hash ON files (hash);
      CREATE INDEX IF NOT EXISTS idx_runtime_refresh_triggered_status ON runtime_refresh (triggered_at, status);
    `);
	}
}
