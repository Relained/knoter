#!/usr/bin/env bash
# Run the live TEI/Codex embedding integration suite with repo-local .env.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_PATH="${KN_ENV_FILE:-$REPO_ROOT/.env}"

if [[ -f "$ENV_PATH" ]]; then
  set -a
  source "$ENV_PATH"
  set +a
fi

cd "$REPO_ROOT"
export KN_TESTDATA_ROOT="${KN_TESTDATA_ROOT:-$REPO_ROOT/../testdata}"
export KN_TEI_MODEL="${KN_TEI_MODEL:-${KN_EMBED_MODEL:-dragonkue/snowflake-arctic-embed-l-v2.0-ko}}"
export KN_TEI_BASE_URL="${KN_TEI_BASE_URL:-${KN_EMBED_BASE_URL:-http://127.0.0.1:39280}}"
exec bun test tests/tei-integration.test.ts
