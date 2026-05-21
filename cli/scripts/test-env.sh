#!/usr/bin/env bash
# Test environment bootstrapper for kn CLI.
#
# Creates an isolated vault rooted at .test-vault/ with a private global config
# at .test-kn-home/, then indexes KN_TESTDATA_ROOT so you can immediately run
# searches without mixing local/private fixtures into the project tree.
#
# Usage:
#   scripts/test-env.sh tei-start   # run local text-embeddings-router in foreground
#   scripts/test-env.sh setup       # create vault + index KN_TESTDATA_ROOT
#   scripts/test-env.sh teardown    # remove vault and private KN_HOME
#   scripts/test-env.sh kn ...      # run kn with the test environment
#   scripts/test-env.sh demo        # run a few sample queries
#
# Embedding backend is configured via env vars (defaults target local TEI):
#   KN_EMBED_BASE_URL    default http://127.0.0.1:39280
#   KN_EMBED_MODEL       default dragonkue/snowflake-arctic-embed-l-v2.0-ko
#   KN_EMBED_API_KEY     default (unset)
#   KN_TEI_PORT          default 39280
#   KN_TESTDATA_ROOT     default ../testdata from cli/; set this in .env to
#                        keep execution/test fixtures outside the repo

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENV_PATH="${KN_ENV_FILE:-$REPO_ROOT/.env}"
if [[ -f "$ENV_PATH" ]]; then
  set -a
  source "$ENV_PATH"
  set +a
fi

export KN_HOME="$REPO_ROOT/.test-kn-home"
VAULT_PATH="$REPO_ROOT/.test-vault"
VAULT_NAME="testvault"

TEI_PORT="${KN_TEI_PORT:-39280}"
EMBED_BASE_URL="${KN_EMBED_BASE_URL:-http://127.0.0.1:$TEI_PORT}"
EMBED_MODEL="${KN_EMBED_MODEL:-dragonkue/snowflake-arctic-embed-l-v2.0-ko}"
EMBED_API_KEY="${KN_EMBED_API_KEY:-}"
TESTDATA_ROOT="${KN_TESTDATA_ROOT:-$REPO_ROOT/../testdata}"

run_kn() {
  KN_HOME="$KN_HOME" bun run src/cli.ts "$@"
}

tei_start() {
  if ! command -v text-embeddings-router >/dev/null; then
    echo "text-embeddings-router not found. Install text-embeddings-inference first." >&2
    exit 1
  fi

  echo "→ starting local TEI router"
  echo "    model: $EMBED_MODEL"
  echo "    port:  $TEI_PORT"
  exec text-embeddings-router --model-id "$EMBED_MODEL" --port "$TEI_PORT"
}

setup() {
  if [[ -d "$VAULT_PATH" ]]; then
    echo "test vault already exists at $VAULT_PATH — run teardown first"
    exit 1
  fi

  echo "→ creating test vault at $VAULT_PATH"
  mkdir -p "$VAULT_PATH"
  local api_key_args=()
  if [[ -n "$EMBED_API_KEY" ]]; then
    api_key_args=(--embedding-api-key "$EMBED_API_KEY")
  fi

  run_kn vault create "$VAULT_NAME" \
    --path "$VAULT_PATH" \
    --model "$EMBED_MODEL" \
    --embedding-base-url "$EMBED_BASE_URL" \
    "${api_key_args[@]}"

  if [[ ! -d "$TESTDATA_ROOT" ]]; then
    echo "KN_TESTDATA_ROOT does not exist: $TESTDATA_ROOT" >&2
    exit 1
  fi

  echo "→ indexing test data from $TESTDATA_ROOT"
  run_kn add "$TESTDATA_ROOT" --recursive --vault "$VAULT_NAME"

  echo
  echo "done. test environment ready:"
  echo "  scripts/test-env.sh kn search '꿈'"
  echo "  scripts/test-env.sh kn vault status --check-providers"
  echo "  scripts/test-env.sh demo"
}

teardown() {
  echo "→ removing $VAULT_PATH and $KN_HOME"
  rm -rf "$VAULT_PATH" "$KN_HOME"
  echo "done."
}

demo() {
  echo "=== vault status ==="
  run_kn vault status
  echo
  echo "=== search: 꿈 (hybrid) ==="
  run_kn search "꿈"
  echo
  echo "=== search: 극단 (semantic) ==="
  run_kn search "극단" --mode semantic
  echo
  echo "=== search: 캡디 (keyword) ==="
  run_kn search "캡디" --mode keyword --top 3
  echo
  echo "=== get: 2026-04-22.md ==="
  run_kn get "$TESTDATA_ROOT/2026-04-22.md"
}

cmd="${1:-}"
shift || true
case "$cmd" in
  tei-start) tei_start ;;
  setup) setup ;;
  teardown) teardown ;;
  demo) demo ;;
  kn) run_kn "$@" ;;
  *)
    echo "usage: $0 {tei-start|setup|teardown|demo|kn ...}"
    exit 1
    ;;
esac
