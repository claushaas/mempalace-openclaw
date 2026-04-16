import fs from 'node:fs';
import path from 'node:path';

import {
	createFingerprint,
	type MemoryArtifact,
	type MemoryPromoteInput,
	MemoryPromoteInputSchema,
	parseWithSchema,
	type SourceConfig,
} from '@mempalace-openclaw/shared';

import type { SyncDaemonMemPalaceClient } from '../client/mcp-stdio-client.js';

export type PreparedChunk = {
	artifactId: string;
	classification:
		| 'artifact'
		| 'conversation'
		| 'decision'
		| 'milestone'
		| 'problem';
	content: string;
	hash: string;
	logicalPath: string;
	memoryType: 'advice' | 'discoveries' | 'events' | 'facts';
	sourceId: string;
	sourcePath: string;
};

const MAX_CHUNK_CHARS = 1500;
const MAX_CHUNK_LINES = 40;

function classifyFromContent(
	source: SourceConfig,
	content: string,
): PreparedChunk['classification'] {
	const mode = source.mode?.toLowerCase() ?? '';
	if (
		mode.includes('repo') ||
		mode.includes('code') ||
		mode.includes('document') ||
		mode.includes('notes')
	) {
		return 'artifact';
	}

	const lower = content.toLowerCase();
	if (lower.includes('decision') || lower.includes('decided')) {
		return 'decision';
	}
	if (
		lower.includes('problem') ||
		lower.includes('incident') ||
		lower.includes('bug')
	) {
		return 'problem';
	}
	if (
		lower.includes('milestone') ||
		lower.includes('released') ||
		lower.includes('shipped')
	) {
		return 'milestone';
	}
	return source.kind === 'spool' ? 'conversation' : 'artifact';
}

function mapMemoryType(
	classification: PreparedChunk['classification'],
): PreparedChunk['memoryType'] {
	switch (classification) {
		case 'decision':
			return 'facts';
		case 'milestone':
			return 'events';
		case 'problem':
			return 'advice';
		case 'conversation':
			return 'events';
		default:
			return 'discoveries';
	}
}

function splitContentIntoChunks(content: string): string[] {
	const lines = content.split('\n');
	const chunks: string[] = [];
	let currentLines: string[] = [];
	let currentLength = 0;

	for (const line of lines) {
		const nextLength = currentLength + line.length + 1;
		if (
			currentLines.length >= MAX_CHUNK_LINES ||
			nextLength > MAX_CHUNK_CHARS
		) {
			chunks.push(currentLines.join('\n').trim());
			currentLines = [];
			currentLength = 0;
		}
		currentLines.push(line);
		currentLength += line.length + 1;
	}

	if (currentLines.length > 0) {
		chunks.push(currentLines.join('\n').trim());
	}

	return chunks.filter((entry) => entry.length > 0);
}

export function prepareSourceChunks(params: {
	content: string;
	logicalPath: string;
	relativePath: string;
	source: SourceConfig;
}): PreparedChunk[] {
	const chunks = splitContentIntoChunks(params.content);
	return chunks.map((chunk, index) => {
		const classification = classifyFromContent(params.source, chunk);
		const hash = createFingerprint({
			chunk,
			logicalPath: params.logicalPath,
			sourceId: params.source.id,
		});
		return {
			artifactId: `${params.source.id}-${hash.slice(0, 16)}`,
			classification,
			content: chunk,
			hash,
			logicalPath: `${params.logicalPath}#chunk=${index + 1}`,
			memoryType: mapMemoryType(classification),
			sourceId: params.source.id,
			sourcePath: `${path.posix.join('/sources', params.source.id, params.relativePath)}#chunk=${index + 1}`,
		};
	});
}

export function readSourceCandidateContent(filePath: string): string {
	return fs.readFileSync(filePath, 'utf8');
}

export function buildPromoteInput(
	chunk: PreparedChunk,
	source: SourceConfig,
): MemoryPromoteInput {
	const metadata = {
		...(source.defaults?.hall ? { defaultsHall: source.defaults.hall } : {}),
		...(source.defaults?.wing ? { defaultsWing: source.defaults.wing } : {}),
		logicalPath: chunk.logicalPath,
		sourceId: source.id,
	};
	return parseWithSchema(
		MemoryPromoteInputSchema,
		{
			artifactId: chunk.artifactId,
			classification: chunk.classification,
			content: chunk.content,
			memoryType: chunk.memoryType,
			metadata,
			source: source.id,
			sourcePath: chunk.sourcePath,
		},
		'Invalid source promote input.',
	);
}

export async function promoteChunks(params: {
	client: SyncDaemonMemPalaceClient;
	chunks: PreparedChunk[];
	source: SourceConfig;
}): Promise<MemoryArtifact[]> {
	const artifacts: MemoryArtifact[] = [];
	for (const chunk of params.chunks) {
		artifacts.push(
			await params.client.promote(buildPromoteInput(chunk, params.source)),
		);
	}
	return artifacts;
}
