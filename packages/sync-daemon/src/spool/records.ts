import fs from 'node:fs';
import path from 'node:path';

import {
  HookEnvelopeSchema,
  type JsonValue,
  createFingerprint,
  parseWithSchema,
} from '@mempalace-openclaw/shared';

import type { SyncStatePaths } from '../config/state.js';

export type SpoolRecord = {
  envelope: ReturnType<typeof HookEnvelopeSchema.parse>;
  hookSource: string;
  processingMetadata?: Record<string, JsonValue> | undefined;
  processingState: 'failed' | 'pending' | 'processed';
  sourceFingerprint: string;
  writtenAt: string;
};

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeFilenamePart(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function atomicWriteJson(filePath: string, value: unknown): void {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

export function ensureSpoolDirs(paths: SyncStatePaths): void {
  ensureDir(paths.pendingSpoolDir);
  ensureDir(paths.processedSpoolDir);
  ensureDir(paths.failedSpoolDir);
  ensureDir(paths.lockDir);
  ensureDir(paths.logsDir);
}

export function listPendingSpoolFiles(paths: SyncStatePaths): string[] {
  ensureSpoolDirs(paths);
  return fs
    .readdirSync(paths.pendingSpoolDir)
    .filter((entry) => entry.endsWith('.json'))
    .sort()
    .map((entry) => path.join(paths.pendingSpoolDir, entry));
}

export function readSpoolRecord(filePath: string): SpoolRecord {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  const envelope = parseWithSchema(
    HookEnvelopeSchema,
    parsed.envelope,
    'Invalid spool hook envelope.',
  );
  return {
    envelope,
    hookSource: typeof parsed.hookSource === 'string' ? parsed.hookSource : 'unknown',
    ...(parsed.processingMetadata &&
    typeof parsed.processingMetadata === 'object' &&
    !Array.isArray(parsed.processingMetadata)
      ? {
          processingMetadata: parsed.processingMetadata as Record<string, JsonValue>,
        }
      : {}),
    processingState:
      parsed.processingState === 'processed' || parsed.processingState === 'failed'
        ? parsed.processingState
        : 'pending',
    sourceFingerprint:
      typeof parsed.sourceFingerprint === 'string'
        ? parsed.sourceFingerprint
        : createFingerprint({
            envelope,
            hookSource: typeof parsed.hookSource === 'string' ? parsed.hookSource : 'unknown',
          }),
    writtenAt:
      typeof parsed.writtenAt === 'string' && parsed.writtenAt.length > 0
        ? parsed.writtenAt
        : new Date().toISOString(),
  };
}

function writeTerminalRecord(
  destinationDir: string,
  filePath: string,
  record: SpoolRecord,
): string {
  const destinationPath = path.join(destinationDir, path.basename(filePath));
  atomicWriteJson(destinationPath, record);
  fs.rmSync(filePath, { force: true });
  return destinationPath;
}

export function markSpoolRecordProcessed(
  paths: SyncStatePaths,
  filePath: string,
  record: SpoolRecord,
  metadata?: Record<string, JsonValue>,
): string {
  ensureSpoolDirs(paths);
  return writeTerminalRecord(paths.processedSpoolDir, filePath, {
    ...record,
    processingMetadata: metadata,
    processingState: 'processed',
  });
}

export function markSpoolRecordFailed(
  paths: SyncStatePaths,
  filePath: string,
  record: SpoolRecord,
  error: unknown,
): string {
  ensureSpoolDirs(paths);
  return writeTerminalRecord(paths.failedSpoolDir, filePath, {
    ...record,
    processingMetadata: {
      error: error instanceof Error ? error.message : String(error),
    },
    processingState: 'failed',
  });
}

export function writePendingSpoolRecord(paths: SyncStatePaths, record: SpoolRecord): string {
  ensureSpoolDirs(paths);
  const basename = [
    sanitizeFilenamePart(record.envelope.timestamp),
    sanitizeFilenamePart(record.envelope.event),
    record.sourceFingerprint.slice(0, 16),
  ].join('--');
  const filePath = path.join(paths.pendingSpoolDir, `${basename}.json`);
  atomicWriteJson(filePath, record);
  return filePath;
}
