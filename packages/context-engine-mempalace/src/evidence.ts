import fs from 'node:fs';
import path from 'node:path';

const PLUGIN_ID = 'claw-context-mempalace';

export function appendContextEngineEvidence(
	event: string,
	payload: Record<string, unknown> = {},
): void {
	const resultsDir = process.env.OPENCLAW_HOST_REAL_RESULTS_DIR;
	if (!resultsDir) {
		return;
	}

	fs.mkdirSync(resultsDir, { recursive: true });
	const filePath = path.join(resultsDir, `${PLUGIN_ID}.jsonl`);
	fs.appendFileSync(
		filePath,
		`${JSON.stringify({
			event,
			payload,
			pluginId: PLUGIN_ID,
			recordedAt: new Date().toISOString(),
		})}\n`,
	);
}
