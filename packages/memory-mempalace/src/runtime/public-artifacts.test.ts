import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { MemoryPublicArtifactStore } from './public-artifacts.js';

const tempDirs: string[] = [];

function createTempDir(): string {
	const dirPath = fs.mkdtempSync(
		path.join(os.tmpdir(), 'memory-public-artifacts-'),
	);
	tempDirs.push(dirPath);
	return dirPath;
}

afterEach(() => {
	for (const dirPath of tempDirs.splice(0)) {
		fs.rmSync(dirPath, { force: true, recursive: true });
	}
});

describe('MemoryPublicArtifactStore', () => {
	it('writes artifacts and lists them via the public artifact surface', async () => {
		const stateDir = createTempDir();
		const store = new MemoryPublicArtifactStore(stateDir);

		store.writeArtifact({
			agentId: 'qa',
			artifactId: 'artifact-decision',
			classification: 'decision',
			content: 'Use the context engine for automatic pre-reply recall.',
			source: 'repo-main',
			sourcePath: '/repo/decision.md',
			sourceType: 'filesystem',
			updatedAt: '2026-04-15T12:00:00Z',
		});

		const artifacts = await store.listArtifacts({
			cfg: {},
		});

		expect(artifacts).toHaveLength(1);
		const [artifact] = artifacts;
		expect(artifact).toBeDefined();
		if (!artifact) {
			throw new Error('Expected a public artifact record to be written.');
		}
		expect(artifact?.kind).toBe('mempalace-memory-artifact');
		expect(artifact?.agentIds).toEqual(['qa']);
		expect(artifact?.contentType).toBe('json');

		const stored = JSON.parse(
			fs.readFileSync(artifact.absolutePath, 'utf8'),
		) as {
			artifactId: string;
			classification: string;
		};
		expect(stored.artifactId).toBe('artifact-decision');
		expect(stored.classification).toBe('decision');
	});
});
