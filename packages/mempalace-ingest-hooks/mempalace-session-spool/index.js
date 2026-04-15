import { appendHookPackEvidence } from '../lib/evidence.js';
import { spawnProcessor } from '../lib/runtime.js';
import {
	createHookEnvelopeFromHostEvent,
	createSpoolRecord,
	writePendingSpoolRecord,
} from '../lib/spool.js';

function buildPayload(event) {
	return {
		commandSource: event?.context?.commandSource,
		messageCount: event?.context?.messageCount,
		previousSessionEntry: event?.context?.previousSessionEntry,
		sessionEntry: event?.context?.sessionEntry,
		tokenCount: event?.context?.tokenCount,
		workspaceDir: event?.context?.workspaceDir,
	};
}

export default async function mempalaceSessionSpoolHook(event) {
	const envelope = createHookEnvelopeFromHostEvent(event, buildPayload(event));
	const record = createSpoolRecord({
		envelope,
		hookSource: 'host-event',
	});
	const filePath = writePendingSpoolRecord(record);
	appendHookPackEvidence('hook.session-spool.persisted', {
		event: envelope.event,
		filePath,
		idempotencyKey: envelope.idempotencyKey,
		sessionId: envelope.sessionId,
	});
	spawnProcessor(event?.context?.cfg ?? {});
}
