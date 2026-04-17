import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');

export function parseVersion(version) {
	const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(version.trim());
	if (!match) {
		throw new Error(`Unsupported version format: ${version}`);
	}

	return match.slice(1).map((part) => Number.parseInt(part ?? '0', 10));
}

export function compareVersions(left, right) {
	for (let index = 0; index < 3; index += 1) {
		const difference = left[index] - right[index];
		if (difference !== 0) {
			return difference;
		}
	}

	return 0;
}

export function satisfiesSupportedRange(version, range) {
	const parts = range.trim().split(/\s+/).filter(Boolean);
	const parsedVersion = parseVersion(version);

	return parts.every((part) => {
		if (part.startsWith('>=')) {
			return compareVersions(parsedVersion, parseVersion(part.slice(2))) >= 0;
		}
		if (part.startsWith('>')) {
			return compareVersions(parsedVersion, parseVersion(part.slice(1))) > 0;
		}
		if (part.startsWith('<=')) {
			return compareVersions(parsedVersion, parseVersion(part.slice(2))) <= 0;
		}
		if (part.startsWith('<')) {
			return compareVersions(parsedVersion, parseVersion(part.slice(1))) < 0;
		}
		if (part.startsWith('=')) {
			return compareVersions(parsedVersion, parseVersion(part.slice(1))) === 0;
		}

		throw new Error(`Unsupported engine constraint: ${part}`);
	});
}

export function readEngineRequirements(packageJsonPath = PACKAGE_JSON_PATH) {
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
	return packageJson.engines ?? {};
}

export function validateEnvironment(env = process.env, requirements = readEngineRequirements()) {
	const nodeVersion = env.SETUP_NODE_VERSION ?? process.version;
	const pnpmVersion = env.SETUP_PNPM_VERSION ?? '';
	const issues = [];

	if (!pnpmVersion) {
		issues.push('pnpm was not found in PATH.');
	}

	if (requirements.node && !satisfiesSupportedRange(nodeVersion, requirements.node)) {
		issues.push(
			`Node.js ${nodeVersion} does not satisfy engines.node (${requirements.node}).`,
		);
	}

	if (
		requirements.pnpm &&
		pnpmVersion &&
		!satisfiesSupportedRange(pnpmVersion, requirements.pnpm)
	) {
		issues.push(
			`pnpm ${pnpmVersion} does not satisfy engines.pnpm (${requirements.pnpm}).`,
		);
	}

	return {
		issues,
		nodeVersion,
		ok: issues.length === 0,
		pnpmVersion,
		requirements,
	};
}

export function formatNextSteps(withHostReal) {
	const lines = [
		'Setup complete.',
		'Next steps:',
		'  1. pnpm test',
		'  2. pnpm smoke:examples',
		'  3. pnpm host-real:recommended-recall',
	];

	if (withHostReal) {
		lines.push('  host-real bootstrap was executed during setup.');
	}

	return lines.join('\n');
}

function runCli(argv) {
	const command = argv[2];
	if (command === 'assert-env') {
		const result = validateEnvironment();
		if (!result.ok) {
			for (const issue of result.issues) {
				console.error(issue);
			}
			process.exitCode = 1;
			return;
		}

		console.log(
			`Environment OK: node=${result.nodeVersion} pnpm=${result.pnpmVersion}`,
		);
		return;
	}

	if (command === 'print-next-steps') {
		const withHostReal = argv.includes('--with-host-real');
		console.log(formatNextSteps(withHostReal));
		return;
	}

	throw new Error(`Unknown setup helper command: ${command ?? '(missing)'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	runCli(process.argv);
}
