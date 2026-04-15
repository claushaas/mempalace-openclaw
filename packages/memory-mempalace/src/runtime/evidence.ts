import fs from 'node:fs';
import path from 'node:path';

const PLUGIN_ID = 'memory-mempalace';

export function appendHostRealEvidence(
	event: string,
	payload: Record<string, unknown> = {},
): void {
	const resultsDir = process.env.OPENCLAW_HOST_REAL_RESULTS_DIR;
	if (!resultsDir) {
		return;
	}

	fs.mkdirSync(resultsDir, { recursive: true });
	const filePath = path.join(resultsDir, `${PLUGIN_ID}.jsonl`);
	const record = {
		event,
		payload,
		pluginId: PLUGIN_ID,
		recordedAt: new Date().toISOString(),
	};
	fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
}
