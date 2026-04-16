#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { runSyncDaemonCli } from './cli/run-cli.js';

function loadHostConfig(): unknown {
	const configPath = process.env.OPENCLAW_CONFIG_PATH?.trim();
	if (!configPath) {
		return {};
	}
	return JSON.parse(readFileSync(configPath, 'utf8'));
}

const exitCode = await runSyncDaemonCli(
	process.argv.slice(2),
	loadHostConfig(),
);
process.exit(exitCode);
