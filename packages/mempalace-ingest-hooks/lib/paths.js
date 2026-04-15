import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT_DIR = path.resolve(__dirname, '..');
const REPO_ROOT_DIR = path.resolve(PACKAGE_ROOT_DIR, '../..');

export function resolveSpoolBaseDir() {
	if (process.env.MEMPALACE_OPENCLAW_SPOOL_DIR) {
		return process.env.MEMPALACE_OPENCLAW_SPOOL_DIR;
	}

	if (process.env.OPENCLAW_CONFIG_PATH) {
		return path.resolve(
			path.dirname(process.env.OPENCLAW_CONFIG_PATH),
			'..',
			'mempalace-openclaw',
			'spool',
		);
	}

	return path.join(REPO_ROOT_DIR, '.tmp', 'mempalace-openclaw', 'spool');
}

export function resolveSpoolPaths() {
	const baseDir = resolveSpoolBaseDir();
	return {
		baseDir,
		failedDir: path.join(baseDir, 'failed'),
		lockDir: path.join(baseDir, 'processor.lock'),
		pendingDir: path.join(baseDir, 'pending'),
		processedDir: path.join(baseDir, 'processed'),
	};
}

export function resolveProcessorEntryPath() {
	return path.join(PACKAGE_ROOT_DIR, 'lib', 'processor-entry.mjs');
}
