import fs from 'node:fs';
import path from 'node:path';
import type { SourceConfig } from '@mempalace-openclaw/shared';
import fg from 'fast-glob';

export type SourceCandidate = {
	absolutePath: string;
	logicalPath: string;
	relativePath: string;
	source: SourceConfig;
};

const SUPPORTED_EXTENSIONS = new Set(['.md', '.txt']);

function isSupportedContentFile(filePath: string): boolean {
	return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function buildPatterns(source: SourceConfig): {
	exclude: string[];
	include: string[];
} {
	const include =
		source.include && source.include.length > 0
			? source.include
			: ['**/*.md', '**/*.txt'];
	const exclude = source.exclude ?? [];
	return { exclude, include };
}

export async function scanSource(
	source: SourceConfig,
): Promise<SourceCandidate[]> {
	const sourcePath = path.resolve(source.path);
	const stats = await fs.promises.stat(sourcePath);
	if (stats.isFile()) {
		if (!isSupportedContentFile(sourcePath)) {
			return [];
		}
		return [
			{
				absolutePath: sourcePath,
				logicalPath: `${source.id}:${path.basename(sourcePath)}`,
				relativePath: path.basename(sourcePath),
				source,
			},
		];
	}

	const { exclude, include } = buildPatterns(source);
	const entries = await fg(include, {
		absolute: true,
		cwd: sourcePath,
		dot: false,
		ignore: exclude,
		onlyFiles: true,
	});

	return entries
		.filter((entry) => isSupportedContentFile(entry))
		.sort()
		.map((entry) => {
			const relativePath = path
				.relative(sourcePath, entry)
				.split(path.sep)
				.join('/');
			return {
				absolutePath: entry,
				logicalPath: `${source.id}:${relativePath}`,
				relativePath,
				source,
			};
		});
}
