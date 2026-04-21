import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const STAGE_ROOT = path.join(ROOT_DIR, '.tmp', 'openclaw-linked-installs');

function fail(message) {
	console.error(message);
	process.exit(1);
}

function copyInstallablePackage(sourceDir, destinationDir) {
	fs.cpSync(sourceDir, destinationDir, {
		force: true,
		filter: (entry) => {
			const baseName = path.basename(entry);
			return baseName !== 'node_modules' && baseName !== '.vite';
		},
		recursive: true,
	});

	const sourceNodeModules = path.join(sourceDir, 'node_modules');
	if (!fs.existsSync(sourceNodeModules)) {
		return;
	}

	fs.cpSync(sourceNodeModules, path.join(destinationDir, 'node_modules'), {
		dereference: true,
		force: true,
		filter: (entry) => path.basename(entry) !== '.vite',
		recursive: true,
	});
}

function run(command, args) {
	const result = spawnSync(command, args, {
		cwd: ROOT_DIR,
		encoding: 'utf8',
		stdio: 'pipe',
	});

	if (result.status !== 0) {
		fail(
			[
				`Command failed: ${command} ${args.join(' ')}`,
				result.stdout?.trim() ? `stdout:\n${result.stdout.trim()}` : null,
				result.stderr?.trim() ? `stderr:\n${result.stderr.trim()}` : null,
			]
				.filter(Boolean)
				.join('\n\n'),
		);
	}

	return result;
}

const packageArg = process.argv[2];
if (!packageArg) {
	fail(
		'Usage: pnpm openclaw:install-local-package -- <package-dir>\nExample: pnpm openclaw:install-local-package -- ./packages/memory-mempalace',
	);
}

const sourceDir = path.resolve(ROOT_DIR, packageArg);
if (!fs.existsSync(sourceDir)) {
	fail(`Package path not found: ${sourceDir}`);
}
if (!fs.existsSync(path.join(sourceDir, 'package.json'))) {
	fail(`package.json not found in: ${sourceDir}`);
}

fs.mkdirSync(STAGE_ROOT, { recursive: true });
const stageDir = path.join(STAGE_ROOT, path.basename(sourceDir));
fs.rmSync(stageDir, { force: true, recursive: true });
copyInstallablePackage(sourceDir, stageDir);

run('pnpm', [
	'exec',
	'openclaw',
	'plugins',
	'install',
	'--link',
	'--dangerously-force-unsafe-install',
	stageDir,
]);

console.log(
	JSON.stringify(
		{
			installedFrom: sourceDir,
			openclawInstallMode: 'link',
			stagedAt: stageDir,
		},
		null,
		2,
	),
);
