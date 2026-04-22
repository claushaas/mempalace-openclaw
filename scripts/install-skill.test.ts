import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	copySkill,
	DEFAULT_SKILL_NAME,
	resolveInstalledSkillPath,
	resolveSkillSource,
	resolveSkillsRoot,
} from './install-skill.mjs';

describe('install-skill helpers', () => {
	it('resolves the default skills root from CODEX_HOME', () => {
		expect(
			resolveSkillsRoot(
				undefined,
				{ CODEX_HOME: '/tmp/codex-home' },
				'/Users/test',
			),
		).toBe(path.join('/tmp/codex-home', 'skills'));
	});

	it('falls back to ~/.codex/skills when CODEX_HOME is missing', () => {
		expect(resolveSkillsRoot(undefined, {}, '/Users/test')).toBe(
			path.join('/Users/test', '.codex', 'skills'),
		);
	});

	it('builds the installed skill path under the target skills root', () => {
		expect(resolveInstalledSkillPath('/tmp/skills')).toBe(
			path.join('/tmp/skills', DEFAULT_SKILL_NAME),
		);
	});

	it('copies the onboarding skill into the requested target directory', () => {
		const tempRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), 'mempalace-openclaw-skill-copy-'),
		);
		const targetDir = path.join(tempRoot, 'skills');
		const result = copySkill({ targetDir });

		expect(result.sourceDir).toBe(resolveSkillSource());
		expect(result.destinationDir).toBe(
			path.join(targetDir, DEFAULT_SKILL_NAME),
		);
		expect(fs.existsSync(path.join(result.destinationDir, 'SKILL.md'))).toBe(
			true,
		);
		expect(
			fs.existsSync(path.join(result.destinationDir, 'agents', 'openai.yaml')),
		).toBe(true);
	});
});
