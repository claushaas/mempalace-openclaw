import fs from 'node:fs';
import path from 'node:path';

import {
	createFingerprint,
	type KnowledgeGraphUpsertInput,
	type MemoryArtifact,
	type MemoryPromoteInput,
	MemoryPromoteInputSchema,
	parseWithSchema,
	type SourceConfig,
} from '@mempalace-openclaw/shared';

import type { SyncDaemonMemPalaceClient } from '../client/mcp-stdio-client.js';

type ClassificationConfidence = 'high' | 'low' | 'medium';

export type PreparedChunk = {
	artifactId: string;
	classification:
		| 'artifact'
		| 'conversation'
		| 'decision'
		| 'milestone'
		| 'problem';
	classificationConfidence: ClassificationConfidence;
	classificationReason: string;
	content: string;
	fingerprint: string;
	hash: string;
	logicalPath: string;
	memoryType: 'advice' | 'discoveries' | 'events' | 'facts';
	sourceId: string;
	sourcePath: string;
};

const MAX_CHUNK_CHARS = 1500;
const MAX_CHUNK_LINES = 40;

function classifyFromMode(
	source: SourceConfig,
): Pick<
	PreparedChunk,
	'classification' | 'classificationConfidence' | 'classificationReason'
> | null {
	const normalizedMode = source.mode?.trim().toLowerCase();
	if (!normalizedMode) {
		return null;
	}

	if (normalizedMode.includes('milestone')) {
		return {
			classification: 'milestone',
			classificationConfidence: 'high',
			classificationReason: `source.mode:${normalizedMode}`,
		};
	}
	if (normalizedMode.includes('session')) {
		return {
			classification: 'conversation',
			classificationConfidence: 'high',
			classificationReason: `source.mode:${normalizedMode}`,
		};
	}
	if (
		normalizedMode.includes('repo') ||
		normalizedMode.includes('code') ||
		normalizedMode.includes('notes') ||
		normalizedMode.includes('documents')
	) {
		return {
			classification: 'artifact',
			classificationConfidence: 'high',
			classificationReason: `source.mode:${normalizedMode}`,
		};
	}

	return null;
}

function classifyFromContent(
	content: string,
): Pick<
	PreparedChunk,
	'classification' | 'classificationConfidence' | 'classificationReason'
> | null {
	const lower = content.toLowerCase();
	const checks = [
		{
			classification: 'decision',
			matches: [/^decision:/m, /\bdecided\b/m],
			reason: 'content-marker:decision',
		},
		{
			classification: 'problem',
			matches: [/^problem:/m, /\bincident\b/m, /\bbug\b/m],
			reason: 'content-marker:problem',
		},
		{
			classification: 'milestone',
			matches: [/^milestone:/m, /\breleased\b/m, /\bshipped\b/m],
			reason: 'content-marker:milestone',
		},
	] as const;

	for (const check of checks) {
		if (check.matches.some((pattern) => pattern.test(lower))) {
			return {
				classification: check.classification,
				classificationConfidence: 'high',
				classificationReason: check.reason,
			};
		}
	}

	return null;
}

function classifyFromPath(
	relativePath: string,
): Pick<
	PreparedChunk,
	'classification' | 'classificationConfidence' | 'classificationReason'
> | null {
	const normalizedPath = relativePath.replaceAll('\\', '/').toLowerCase();
	if (
		normalizedPath.includes('/sessions/') ||
		normalizedPath.startsWith('sessions/')
	) {
		return {
			classification: 'conversation',
			classificationConfidence: 'medium',
			classificationReason: 'path-signal:sessions',
		};
	}
	if (
		normalizedPath.includes('readme') ||
		normalizedPath.includes('/docs/') ||
		normalizedPath.endsWith('.md') ||
		normalizedPath.endsWith('.txt')
	) {
		return {
			classification: 'artifact',
			classificationConfidence: 'medium',
			classificationReason: 'path-signal:document',
		};
	}

	return null;
}

function classifyChunk(params: {
	content: string;
	relativePath: string;
	source: SourceConfig;
}): Pick<
	PreparedChunk,
	'classification' | 'classificationConfidence' | 'classificationReason'
> {
	return (
		classifyFromMode(params.source) ??
		classifyFromContent(params.content) ??
		classifyFromPath(params.relativePath) ?? {
			classification:
				params.source.kind === 'spool' ? 'conversation' : 'artifact',
			classificationConfidence: 'low',
			classificationReason: `source.kind:${params.source.kind}`,
		}
	);
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

function parseIsoDate(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}
	const parsed = Date.parse(value.trim());
	return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function extractHeadingEntities(content: string, artifactId: string) {
	return content
		.split('\n')
		.filter((line) => line.trim().startsWith('#'))
		.map((line) => line.replace(/^#+\s*/, '').trim())
		.filter(Boolean)
		.map((name) => ({
			entityId: `entity-${createFingerprint({ artifactId, name }).slice(0, 12)}`,
			entityType: 'heading',
			name,
			sourceArtifactId: artifactId,
		}));
}

function extractCapitalizedEntities(content: string, artifactId: string) {
	const matches = content.match(/\b[A-Z][a-zA-Z0-9_-]{2,}\b/g) ?? [];
	const counts = new Map<string, number>();
	for (const match of matches) {
		counts.set(match, (counts.get(match) ?? 0) + 1);
	}
	return [...counts.entries()]
		.filter(([, count]) => count >= 2)
		.map(([name]) => ({
			entityId: `entity-${createFingerprint({ artifactId, name }).slice(0, 12)}`,
			entityType: 'token',
			name,
			sourceArtifactId: artifactId,
		}));
}

function extractExplicitRelations(
	content: string,
	artifactId: string,
	entities: Array<{ entityId: string; name: string }>,
) {
	const entityByName = new Map(
		entities.map((entity) => [entity.name.toLowerCase(), entity.entityId]),
	);
	const relations = [];
	for (const [relationType, pattern] of [
		['depends-on', /^depends-on:\s*(.+)$/gim],
		['owner', /^owner:\s*(.+)$/gim],
		['uses', /^uses:\s*(.+)$/gim],
		['blocks', /^blocks:\s*(.+)$/gim],
		['related-to', /^related-to:\s*(.+)$/gim],
	] as const) {
		for (const match of content.matchAll(pattern)) {
			const targetName = match[1]?.trim();
			if (!targetName) {
				continue;
			}
			const sourceEntityId =
				entities[0]?.entityId ??
				`entity-${createFingerprint({ artifactId, relationType }).slice(0, 12)}`;
			const targetEntityId =
				entityByName.get(targetName.toLowerCase()) ??
				`entity-${createFingerprint({ artifactId, relationType, targetName }).slice(0, 12)}`;
			relations.push({
				relationType,
				sourceArtifactId: artifactId,
				sourceEntityId,
				targetEntityId,
			});
		}
	}
	return relations;
}

export function prepareSourceChunks(params: {
	content: string;
	logicalPath: string;
	relativePath: string;
	source: SourceConfig;
}): PreparedChunk[] {
	const chunks = splitContentIntoChunks(params.content);
	return chunks.map((chunk, index) => {
		const classified = classifyChunk({
			content: chunk,
			relativePath: params.relativePath,
			source: params.source,
		});
		const fingerprint = createFingerprint({
			chunk,
			sourceId: params.source.id,
		});
		const hash = createFingerprint({
			chunk,
			logicalPath: params.logicalPath,
			sourceId: params.source.id,
		});
		return {
			artifactId: `${params.source.id}-${hash.slice(0, 16)}`,
			classification: classified.classification,
			classificationConfidence: classified.classificationConfidence,
			classificationReason: classified.classificationReason,
			content: chunk,
			fingerprint,
			hash,
			logicalPath: `${params.logicalPath}#chunk=${index + 1}`,
			memoryType: mapMemoryType(classified.classification),
			sourceId: params.source.id,
			sourcePath: `${path.posix.join('/sources', params.source.id, params.relativePath)}#chunk=${index + 1}`,
		};
	});
}

export function readSourceCandidateContent(filePath: string): string {
	return fs.readFileSync(filePath, 'utf8');
}

export function buildKnowledgeGraphUpsertInput(params: {
	artifactId: string;
	chunk: PreparedChunk;
}): KnowledgeGraphUpsertInput | null {
	const headingEntities = extractHeadingEntities(
		params.chunk.content,
		params.artifactId,
	);
	const fileEntity = {
		entityId: `entity-${createFingerprint({
			artifactId: params.artifactId,
			path: params.chunk.sourcePath,
		}).slice(0, 12)}`,
		entityType: 'file',
		name: path.posix
			.basename(params.chunk.sourcePath)
			.replace(/#chunk=\d+$/, ''),
		sourceArtifactId: params.artifactId,
	};
	const capitalizedEntities = extractCapitalizedEntities(
		params.chunk.content,
		params.artifactId,
	);
	const entities = [fileEntity, ...headingEntities, ...capitalizedEntities];
	const uniqueEntities = [
		...new Map(entities.map((entity) => [entity.entityId, entity])).values(),
	];
	const relations = extractExplicitRelations(
		params.chunk.content,
		params.artifactId,
		uniqueEntities,
	);

	const validFromMatch = params.chunk.content.match(/^validFrom:\s*(.+)$/im);
	const validToMatch = params.chunk.content.match(/^validTo:\s*(.+)$/im);
	const effectiveMatch = params.chunk.content.match(/^effective:\s*(.+)$/im);
	const validFrom = parseIsoDate(validFromMatch?.[1] ?? effectiveMatch?.[1]);
	const validTo = parseIsoDate(validToMatch?.[1]);
	const validity = {
		...(validFrom ? { validFrom } : {}),
		...(validTo ? { validTo } : {}),
	};

	const normalizedEntities = uniqueEntities.map((entity) => ({
		...entity,
		...validity,
	}));
	const normalizedRelations = relations.map((relation) => ({
		...relation,
		...validity,
	}));

	if (normalizedEntities.length === 0 && normalizedRelations.length === 0) {
		return null;
	}

	return {
		entities: normalizedEntities,
		relations: normalizedRelations,
		sourceArtifactId: params.artifactId,
	};
}

export function buildPromoteInput(
	chunk: PreparedChunk,
	source: SourceConfig,
): MemoryPromoteInput {
	const metadata = {
		classificationConfidence: chunk.classificationConfidence,
		classificationReason: chunk.classificationReason,
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
