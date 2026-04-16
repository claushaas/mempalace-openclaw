import os from 'node:os';
import path from 'node:path';

export type SyncStatePaths = {
	baseDir: string;
	dbPath: string;
	failedSpoolDir: string;
	legacySpoolDir: string;
	lockDir: string;
	logsDir: string;
	pendingSpoolDir: string;
	processedSpoolDir: string;
	spoolBaseDir: string;
};

function resolveOpenClawStateDir(): string {
	const configured = process.env.MEMPALACE_OPENCLAW_SYNC_STATE_DIR?.trim();
	if (configured) {
		return configured;
	}

	const openClawStateDir = process.env.OPENCLAW_STATE_DIR?.trim();
	if (openClawStateDir) {
		return path.join(openClawStateDir, 'plugins', 'mempalace-openclaw', 'sync');
	}

	return path.join(
		os.homedir(),
		'.openclaw',
		'plugins',
		'mempalace-openclaw',
		'sync',
	);
}

export function resolveLegacySpoolDir(): string {
	const configPath = process.env.OPENCLAW_CONFIG_PATH?.trim();
	if (configPath) {
		return path.resolve(
			path.dirname(configPath),
			'..',
			'mempalace-openclaw',
			'spool',
		);
	}

	return path.resolve(process.cwd(), '.tmp', 'mempalace-openclaw', 'spool');
}

export function resolveSyncStatePaths(): SyncStatePaths {
	const baseDir = resolveOpenClawStateDir();
	const dbPath =
		process.env.MEMPALACE_OPENCLAW_SYNC_DB_PATH?.trim() ||
		path.join(baseDir, 'sync.db');
	const spoolBaseDir =
		process.env.MEMPALACE_OPENCLAW_SPOOL_DIR?.trim() ||
		path.join(baseDir, 'spool');

	return {
		baseDir,
		dbPath,
		failedSpoolDir: path.join(spoolBaseDir, 'failed'),
		legacySpoolDir: resolveLegacySpoolDir(),
		lockDir: path.join(baseDir, 'locks'),
		logsDir: path.join(baseDir, 'logs'),
		pendingSpoolDir: path.join(spoolBaseDir, 'pending'),
		processedSpoolDir: path.join(spoolBaseDir, 'processed'),
		spoolBaseDir,
	};
}
