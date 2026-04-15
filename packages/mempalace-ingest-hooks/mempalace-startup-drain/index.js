import { appendHookPackEvidence } from '../lib/evidence.js';
import { spawnProcessor } from '../lib/runtime.js';

export default async function mempalaceStartupDrainHook(event) {
	appendHookPackEvidence('hook.startup-drain.received', {
		event: `${event?.type ?? 'unknown'}:${event?.action ?? 'unknown'}`,
	});
	spawnProcessor(event?.context?.cfg ?? {});
}
