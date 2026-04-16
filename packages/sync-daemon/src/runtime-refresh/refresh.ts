import { createFingerprint } from '@mempalace-openclaw/shared';

import type { SyncDaemonMemPalaceClient } from '../client/mcp-stdio-client.js';
import type { SyncDatabase } from '../db/store.js';

export async function triggerRuntimeRefresh(params: {
	client: SyncDaemonMemPalaceClient;
	db: SyncDatabase;
	force?: boolean;
	reason:
		| 'cache-refresh'
		| 'checkpoint-refresh'
		| 'manual-reindex'
		| 'post-ingest'
		| 'scheduled-sync';
	sourceId?: string;
}): Promise<{ refreshId: string }> {
	const triggeredAt = new Date().toISOString();
	const refreshId = createFingerprint({
		reason: params.reason,
		sourceId: params.sourceId ?? 'all',
		triggeredAt,
	}).slice(0, 16);

	params.db.insertRefresh({
		id: refreshId,
		reason: params.reason,
		status: 'running',
		triggeredAt,
	});

	try {
		await params.client.refreshIndex({
			force: params.force,
			reason: params.reason,
			sourceId: params.sourceId,
			target: 'runtime',
		});
		params.db.markRefreshCompleted(refreshId, 'completed');
		return { refreshId };
	} catch (error) {
		params.db.markRefreshCompleted(refreshId, 'failed');
		throw error;
	}
}
