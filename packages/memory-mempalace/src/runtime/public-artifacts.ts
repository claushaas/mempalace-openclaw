import fs from 'node:fs';
import path from 'node:path';

import {
	type MemoryArtifact,
	MemoryArtifactSchema,
	parseWithSchema,
} from '@mempalace-openclaw/shared';
import type {
	MemoryPluginPublicArtifact,
	MemoryPluginPublicArtifactsProvider,
	OpenClawConfig,
} from 'openclaw/plugin-sdk/core';

const PUBLIC_ARTIFACT_KIND = 'mempalace-memory-artifact';

function ensureDir(dirPath: string): void {
	fs.mkdirSync(dirPath, { recursive: true });
}

function writeJsonAtomically(filePath: string, value: unknown): void {
	ensureDir(path.dirname(filePath));
	const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
	fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
	fs.renameSync(tempPath, filePath);
}

export class MemoryPublicArtifactStore
	implements MemoryPluginPublicArtifactsProvider
{
	public constructor(private readonly stateDir: string) {}

	public listArtifacts(_params: {
		cfg: OpenClawConfig;
	}): Promise<MemoryPluginPublicArtifact[]> {
		if (!fs.existsSync(this.getArtifactsDir())) {
			return Promise.resolve([]);
		}

		const artifacts: MemoryPluginPublicArtifact[] = [];
		for (const entry of fs.readdirSync(this.getArtifactsDir())) {
			if (!entry.endsWith('.json')) {
				continue;
			}

			const absolutePath = path.join(this.getArtifactsDir(), entry);
			const artifact = parseWithSchema(
				MemoryArtifactSchema,
				JSON.parse(fs.readFileSync(absolutePath, 'utf8')),
				'Invalid public memory artifact record.',
			);

			artifacts.push({
				absolutePath,
				agentIds: artifact.agentId ? [artifact.agentId] : [],
				contentType: 'json',
				kind: PUBLIC_ARTIFACT_KIND,
				relativePath: path.relative(this.stateDir, absolutePath),
				workspaceDir: this.stateDir,
			});
		}

		return Promise.resolve(
			artifacts.sort((left, right) =>
				left.relativePath.localeCompare(right.relativePath),
			),
		);
	}

	public writeArtifact(artifact: MemoryArtifact): void {
		writeJsonAtomically(
			this.resolveArtifactPath(artifact.artifactId),
			artifact,
		);
	}

	private getArtifactsDir(): string {
		return path.join(
			this.stateDir,
			'plugins',
			'memory-mempalace',
			'public-artifacts',
		);
	}

	private resolveArtifactPath(artifactId: string): string {
		return path.join(this.getArtifactsDir(), `${artifactId}.json`);
	}
}
