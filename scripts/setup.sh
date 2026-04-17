#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WITH_HOST_REAL=0

if [[ "${1-}" == "--with-host-real" ]]; then
	WITH_HOST_REAL=1
elif [[ $# -gt 0 ]]; then
	echo "Unknown argument: $1" >&2
	echo "Usage: bash ./scripts/setup.sh [--with-host-real]" >&2
	exit 1
fi

cd "$ROOT_DIR"

PNPM_VERSION=""
if command -v pnpm >/dev/null 2>&1; then
	PNPM_VERSION="$(pnpm --version)"
fi

SETUP_PNPM_VERSION="$PNPM_VERSION" node ./scripts/setup.mjs assert-env

mkdir -p \
	./.tmp \
	./.tmp/diagnostics \
	./.tmp/detached-node-modules \
	./.tmp/host-real-results \
	./.tmp/openclaw-host

pnpm install
pnpm build
pnpm validate-config

if [[ "$WITH_HOST_REAL" -eq 1 ]]; then
	pnpm host-real:bootstrap
fi

node ./scripts/setup.mjs print-next-steps "$([[ "$WITH_HOST_REAL" -eq 1 ]] && echo --with-host-real)"
