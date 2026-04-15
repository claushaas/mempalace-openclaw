import fs from 'node:fs';
import path from 'node:path';

const PACK_ID = 'mempalace-ingest-hooks';

export function appendHookPackEvidence(event, payload = {}) {
	const resultsDir = process.env.OPENCLAW_HOST_REAL_RESULTS_DIR;
	if (!resultsDir) {
		return;
	}

	fs.mkdirSync(resultsDir, { recursive: true });
	const filePath = path.join(resultsDir, `${PACK_ID}.jsonl`);
	const record = {
		event,
		packId: PACK_ID,
		payload,
		recordedAt: new Date().toISOString(),
	};
	fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
}
