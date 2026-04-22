import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

export const DEFAULT_SKILL_NAME = 'mempalace-openclaw-onboarding';

export function resolveSkillSource(skillName = DEFAULT_SKILL_NAME) {
	return path.join(ROOT_DIR, 'skills', skillName);
}

export function resolveSkillsRoot(
	targetDir,
	env = process.env,
	homeDir = os.homedir(),
) {
	if (targetDir) {
		return path.resolve(targetDir);
	}

	if (env.CODEX_HOME) {
		return path.join(path.resolve(env.CODEX_HOME), 'skills');
	}

	return path.join(homeDir, '.codex', 'skills');
}

export function resolveInstalledSkillPath(
	targetDir,
	skillName = DEFAULT_SKILL_NAME,
	env = process.env,
	homeDir = os.homedir(),
) {
	return path.join(resolveSkillsRoot(targetDir, env, homeDir), skillName);
}

export function copySkill({
	env = process.env,
	homeDir = os.homedir(),
	skillName = DEFAULT_SKILL_NAME,
	targetDir,
} = {}) {
	const sourceDir = resolveSkillSource(skillName);
	if (!fs.existsSync(sourceDir)) {
		throw new Error(`Skill source not found: ${sourceDir}`);
	}

	const skillsRoot = resolveSkillsRoot(targetDir, env, homeDir);
	const destinationDir = path.join(skillsRoot, skillName);

	fs.mkdirSync(skillsRoot, { recursive: true });
	fs.rmSync(destinationDir, { force: true, recursive: true });
	fs.cpSync(sourceDir, destinationDir, { force: true, recursive: true });

	return {
		destinationDir,
		skillsRoot,
		sourceDir,
	};
}

function printUsage() {
	console.error(
		[
			'Usage: pnpm skill:copy:onboarding -- [skills-dir]',
			'',
			'Copies skills/mempalace-openclaw-onboarding into the target skills directory.',
			'If [skills-dir] is omitted, the script uses:',
			'  1. ${CODEX_HOME}/skills when CODEX_HOME is set',
			'  2. ~/.codex/skills otherwise',
			'',
			'Example:',
			'  pnpm skill:copy:onboarding -- "${CODEX_HOME:-$HOME/.codex}/skills"',
		].join('\n'),
	);
}

function runCli(argv) {
	const rawArgs = argv.slice(2);
	const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;

	if (args.includes('--help') || args.includes('-h')) {
		printUsage();
		return;
	}

	if (args.length > 1) {
		printUsage();
		process.exitCode = 1;
		return;
	}

	const result = copySkill({
		targetDir: args[0],
	});

	console.log(`Copied ${DEFAULT_SKILL_NAME} to ${result.destinationDir}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	runCli(process.argv);
}
