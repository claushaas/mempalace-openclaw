import { appendHookPackEvidence } from '../lib/evidence.js';

export default async function mempalaceStartupDrainHook(event) {
	appendHookPackEvidence('hook.startup-drain.received', {
		event: `${event?.type ?? 'unknown'}:${event?.action ?? 'unknown'}`,
		mode: 'enqueue-only',
	});
}
