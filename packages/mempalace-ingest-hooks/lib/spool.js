import fs from 'node:fs';
import path from 'node:path';

import {
	assertHookEnvelope,
	createFingerprint,
	createVersionedHookEnvelope,
} from './contracts.js';

import { resolveSpoolPaths } from './paths.js';

function ensureSpoolDirs(paths) {
	fs.mkdirSync(paths.pendingDir, { recursive: true });
	fs.mkdirSync(paths.processedDir, { recursive: true });
	fs.mkdirSync(paths.failedDir, { recursive: true });
}

function sanitizeFilenamePart(value) {
	return String(value)
		.replace(/[^a-zA-Z0-9._-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 80);
}

function atomicWriteJson(filePath, value) {
	const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
	fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
	fs.renameSync(tempPath, filePath);
}

function getSessionId(event) {
	return String(
		event?.sessionKey ??
			event?.context?.sessionEntry?.sessionKey ??
			event?.context?.previousSessionEntry?.sessionKey ??
			event?.context?.sessionId ??
			'unknown-session',
	);
}

function getAgentId(event) {
	return String(
		event?.context?.agentId ??
			event?.context?.sessionEntry?.agentId ??
			event?.context?.previousSessionEntry?.agentId ??
			'default-agent',
	);
}

function getTimestamp(event) {
	const raw =
		event?.timestamp ??
		event?.context?.timestamp ??
		event?.context?.occurredAt ??
		new Date().toISOString();
	if (typeof raw === 'string' && raw.length > 0) {
		return Number.isNaN(Date.parse(raw)) ? new Date().toISOString() : raw;
	}
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		return new Date(raw).toISOString();
	}
	if (raw instanceof Date) {
		return raw.toISOString();
	}
	return new Date().toISOString();
}

export function getHostEventKey(event) {
	const type = typeof event?.type === 'string' ? event.type : '';
	const action = typeof event?.action === 'string' ? event.action : '';
	if (type.length > 0 && action.length > 0) {
		return `${type}:${action}`;
	}
	return type || action || 'unknown';
}

export function createHookEnvelopeFromHostEvent(event, payload) {
	const eventKey = getHostEventKey(event);
	const sessionId = getSessionId(event);
	const timestamp = getTimestamp(event);
	const normalizedPayload = payload;
	const idempotencyKey = createFingerprint({
		event: eventKey,
		payload: normalizedPayload,
		sessionId,
		timestamp,
	});

	return createVersionedHookEnvelope({
		agentId: getAgentId(event),
		event: eventKey,
		idempotencyKey,
		payload: normalizedPayload,
		sessionId,
		timestamp,
	});
}

export function createSpoolRecord({ envelope, hookSource }) {
	const validatedEnvelope = assertHookEnvelope(envelope);
	const sourceFingerprint = createFingerprint({
		envelope: validatedEnvelope,
		hookSource,
	});
	return {
		envelope: validatedEnvelope,
		hookSource,
		processingState: 'pending',
		sourceFingerprint,
		writtenAt: new Date().toISOString(),
	};
}

export function writePendingSpoolRecord(record) {
	const paths = resolveSpoolPaths();
	ensureSpoolDirs(paths);
	const basename = [
		sanitizeFilenamePart(record.envelope.timestamp),
		sanitizeFilenamePart(record.envelope.event),
		record.sourceFingerprint.slice(0, 16),
	].join('--');
	const filePath = path.join(paths.pendingDir, `${basename}.json`);
	atomicWriteJson(filePath, record);
	return filePath;
}

export function listPendingSpoolFiles() {
	const paths = resolveSpoolPaths();
	ensureSpoolDirs(paths);
	return fs
		.readdirSync(paths.pendingDir)
		.filter((entry) => entry.endsWith('.json'))
		.sort()
		.map((entry) => path.join(paths.pendingDir, entry));
}

export function readSpoolRecord(filePath) {
	const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
	const envelope = assertHookEnvelope(parsed.envelope);
	return {
		envelope,
		hookSource:
			typeof parsed.hookSource === 'string' ? parsed.hookSource : 'unknown',
		processingState:
			typeof parsed.processingState === 'string'
				? parsed.processingState
				: 'pending',
		sourceFingerprint:
			typeof parsed.sourceFingerprint === 'string'
				? parsed.sourceFingerprint
				: createFingerprint({ envelope }),
		writtenAt:
			typeof parsed.writtenAt === 'string'
				? parsed.writtenAt
				: new Date().toISOString(),
	};
}

function writeTerminalRecord(destinationDir, filePath, record) {
	const destinationPath = path.join(destinationDir, path.basename(filePath));
	atomicWriteJson(destinationPath, record);
	fs.rmSync(filePath, { force: true });
	return destinationPath;
}

export function markSpoolRecordProcessed(filePath, record, metadata = {}) {
	const paths = resolveSpoolPaths();
	ensureSpoolDirs(paths);
	return writeTerminalRecord(paths.processedDir, filePath, {
		...record,
		processedAt: new Date().toISOString(),
		processingMetadata: metadata,
		processingState: 'processed',
	});
}

export function markSpoolRecordFailed(filePath, record, error) {
	const paths = resolveSpoolPaths();
	ensureSpoolDirs(paths);
	return writeTerminalRecord(paths.failedDir, filePath, {
		...record,
		error: {
			message: error instanceof Error ? error.message : String(error),
			name: error instanceof Error ? error.name : 'Error',
		},
		failedAt: new Date().toISOString(),
		processingState: 'failed',
	});
}

export function acquireProcessorLock() {
	const paths = resolveSpoolPaths();
	ensureSpoolDirs(paths);
	try {
		fs.mkdirSync(paths.lockDir);
		return true;
	} catch (error) {
		if (error && typeof error === 'object' && error.code === 'EEXIST') {
			return false;
		}
		throw error;
	}
}

export function releaseProcessorLock() {
	const paths = resolveSpoolPaths();
	fs.rmSync(paths.lockDir, { force: true, recursive: true });
}
