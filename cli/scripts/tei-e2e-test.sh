#!/usr/bin/env bash
# Run the live TEI/Codex embedding integration suite with repo-local .env.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_PATH="${KN_ENV_FILE:-$REPO_ROOT/.env}"

if [[ ! -f "$ENV_PATH" ]]; then
  echo "Missing env file: $ENV_PATH" >&2
  exit 1
fi

set -a
source "$ENV_PATH"
set +a

cd "$REPO_ROOT"
export KN_TESTDATA_ROOT="${KN_TESTDATA_ROOT:-$REPO_ROOT/../testdata}"
exec bun test tests/tei-integration.test.ts
