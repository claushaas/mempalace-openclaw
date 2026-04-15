import { resolveMemoryBackendConfig } from './config.js';
import { appendHookPackEvidence } from './evidence.js';
import { HookPackMemPalaceClient } from './mcp-client.js';
import { normalizeSpoolRecordToPromoteInput } from './normalize.js';
import {
	acquireProcessorLock,
	listPendingSpoolFiles,
	markSpoolRecordFailed,
	markSpoolRecordProcessed,
	readSpoolRecord,
	releaseProcessorLock,
} from './spool.js';

export async function processPendingSpool({ cfg }) {
	if (!acquireProcessorLock()) {
		appendHookPackEvidence('processor.lock-skipped');
		return { processed: 0, skipped: true };
	}

	const backendConfig = resolveMemoryBackendConfig(cfg);
	const client = new HookPackMemPalaceClient(backendConfig);
	const pendingFiles = listPendingSpoolFiles();
	let processed = 0;
	appendHookPackEvidence('processor.start', {
		pendingCount: pendingFiles.length,
	});

	try {
		for (const filePath of pendingFiles) {
			const record = readSpoolRecord(filePath);
			try {
				const promoteInput = normalizeSpoolRecordToPromoteInput(record);
				const artifact = await client.promote(promoteInput);
				await client.refreshIndex({
					reason: 'post-ingest',
					target: 'runtime',
				});
				markSpoolRecordProcessed(filePath, record, {
					artifactId: artifact.artifactId,
					refreshed: true,
				});
				processed += 1;
				appendHookPackEvidence('processor.record-processed', {
					artifactId: artifact.artifactId,
					event: record.envelope.event,
					filePath,
				});
			} catch (error) {
				markSpoolRecordFailed(filePath, record, error);
				appendHookPackEvidence('processor.record-failed', {
					error: error instanceof Error ? error.message : String(error),
					event: record.envelope.event,
					filePath,
				});
			}
		}

		appendHookPackEvidence('processor.complete', {
			processed,
		});
		return { processed, skipped: false };
	} finally {
		await client.close().catch(() => undefined);
		releaseProcessorLock();
	}
}
