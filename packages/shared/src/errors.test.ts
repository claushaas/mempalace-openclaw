import { describe, expect, it } from 'vitest';

import {
	ArtifactNotFoundError,
	BackendUnavailableError,
	InvalidPromoteRequestError,
	InvalidRefreshRequestError,
	SchemaValidationError,
	SourceNotFoundError,
} from './index.js';

describe('shared errors', () => {
	it('exposes stable codes and preserves details', () => {
		expect(new SourceNotFoundError('repo-main').code).toBe('source_not_found');
		expect(new ArtifactNotFoundError('art_1').details).toEqual({
			artifactId: 'art_1',
		});
		expect(
			new InvalidRefreshRequestError('bad refresh', undefined, {
				target: 'runtime',
			}).details,
		).toEqual({
			target: 'runtime',
		});
		expect(
			new InvalidPromoteRequestError('bad promote', undefined, {
				source: 'project-notes',
			}).details,
		).toEqual({ source: 'project-notes' });
	});

	it('preserves cause when provided', () => {
		const cause = new Error('downstream');
		const error = new BackendUnavailableError('backend unavailable', cause, {
			source: 'repo-main',
		});

		expect(error.code).toBe('backend_unavailable');
		expect(error.cause).toBe(cause);
		expect(error.details).toEqual({ source: 'repo-main' });
	});

	it('keeps zod issues as serializable details for schema validation errors', () => {
		const error = new SchemaValidationError('invalid schema', [
			{
				code: 'custom',
				message: 'Expected artifactId',
				path: ['artifactId'],
			},
		]);

		expect(error.code).toBe('schema_validation_error');
		expect(error.details).toEqual({
			issues: [
				{
					code: 'custom',
					message: 'Expected artifactId',
					path: ['artifactId'],
				},
			],
		});
	});
});
