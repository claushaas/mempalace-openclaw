import { assertPromoteInput } from './contracts.js';

function toMarkdownSection(title, content) {
	return `## ${title}\n\n${content}`.trim();
}

function stringifyPayload(payload) {
	return `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
}

function normalizeSessionContent(record) {
	return [
		'# OpenClaw Session Capture',
		'',
		toMarkdownSection(
			'Envelope',
			stringifyPayload({
				agentId: record.envelope.agentId,
				event: record.envelope.event,
				idempotencyKey: record.envelope.idempotencyKey,
				sessionId: record.envelope.sessionId,
				timestamp: record.envelope.timestamp,
			}),
		),
		'',
		toMarkdownSection(
			'Payload Snapshot',
			stringifyPayload(record.envelope.payload),
		),
	].join('\n');
}

export function normalizeSpoolRecordToPromoteInput(record) {
	if (record.envelope.event === 'milestone') {
		const payload =
			record.envelope.payload && typeof record.envelope.payload === 'object'
				? record.envelope.payload
				: {};
		return assertPromoteInput(
			{
				agentId: record.envelope.agentId,
				artifactId:
					typeof payload.artifactId === 'string'
						? payload.artifactId
						: undefined,
				classification:
					typeof payload.classification === 'string'
						? payload.classification
						: 'milestone',
				content:
					typeof payload.content === 'string'
						? payload.content
						: `Milestone captured for ${record.envelope.sessionId}`,
				memoryType:
					typeof payload.memoryType === 'string'
						? payload.memoryType
						: 'discoveries',
				metadata: {
					hookSource: record.hookSource,
					sourceFingerprint: record.sourceFingerprint,
				},
				sessionId: record.envelope.sessionId,
				source: 'openclaw-hook-pack',
				sourcePath: `/hooks/milestones/${record.envelope.sessionId}.md`,
			},
			'Invalid milestone promote input.',
		);
	}

	return assertPromoteInput(
		{
			agentId: record.envelope.agentId,
			artifactId: `session-${record.envelope.sessionId}-${record.sourceFingerprint.slice(0, 12)}`,
			classification: 'conversation',
			content: normalizeSessionContent(record),
			memoryType: 'events',
			metadata: {
				hookSource: record.hookSource,
				sourceFingerprint: record.sourceFingerprint,
			},
			sessionId: record.envelope.sessionId,
			source: 'openclaw-hook-pack',
			sourcePath: `/sessions/${record.envelope.sessionId}/${record.envelope.event}.md`,
		},
		'Invalid session flush promote input.',
	);
}
