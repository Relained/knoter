#!/usr/bin/env bash
# Test environment bootstrapper for kn CLI.
#
# Creates an isolated vault rooted at .test-vault/ with a private global config
# at .test-kn-home/, then indexes testdata/ so you can immediately run searches.
#
# Usage:
#   scripts/test-env.sh tei-install # create TEI podman container (one-time)
#   scripts/test-env.sh setup       # create vault + index testdata/
#   scripts/test-env.sh teardown    # remove vault (keeps TEI container)
#   scripts/test-env.sh tei-remove  # remove TEI container + model volume
#   scripts/test-env.sh kn ...      # run kn with the test environment
#   scripts/test-env.sh demo        # run a few sample queries
#
# Embedding backend is configured via env vars (defaults target local TEI):
#   KN_EMBED_BASE_URL    default http://localhost:8080
#   KN_EMBED_MODEL       default dragonkue/snowflake-arctic-embed-l-v2.0-ko
#   KN_EMBED_API_KEY     default (unset)
#   KN_EMBED_CONTAINER   default kn-tei  (podman container name for lazy-start)
#   KN_EMBED_RUNTIME     default podman  (podman|docker)
#   KN_TEI_IMAGE         default ghcr.io/huggingface/text-embeddings-inference:cpu-latest
#                        (auto-switched to :latest when KN_TEI_GPU=1 if unset)
#   KN_TEI_PORT          default 8080    (host port mapped to container :80)
#   KN_TEI_VOLUME        default kn-tei-models  (named volume for HF model cache)
#   KN_TEI_GPU           default 0       (set to 1 for CUDA TEI + nvidia.com/gpu=all CDI)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

export KN_HOME="$REPO_ROOT/.test-kn-home"
VAULT_PATH="$REPO_ROOT/.test-vault"
VAULT_NAME="testvault"

EMBED_BASE_URL="${KN_EMBED_BASE_URL:-http://localhost:8080}"
EMBED_MODEL="${KN_EMBED_MODEL:-dragonkue/snowflake-arctic-embed-l-v2.0-ko}"
EMBED_API_KEY="${KN_EMBED_API_KEY:-}"
EMBED_CONTAINER="${KN_EMBED_CONTAINER:-kn-tei}"
EMBED_RUNTIME="${KN_EMBED_RUNTIME:-podman}"
TEI_GPU="${KN_TEI_GPU:-0}"
if [[ "$TEI_GPU" == "1" ]]; then
  TEI_IMAGE="${KN_TEI_IMAGE:-ghcr.io/huggingface/text-embeddings-inference:latest}"
else
  TEI_IMAGE="${KN_TEI_IMAGE:-ghcr.io/huggingface/text-embeddings-inference:cpu-latest}"
fi
TEI_PORT="${KN_TEI_PORT:-8080}"
TEI_VOLUME="${KN_TEI_VOLUME:-kn-tei-models}"

run_kn() {
  KN_HOME="$KN_HOME" bun run src/cli.ts "$@"
}

write_vault_config() {
  local cfg="$VAULT_PATH/.kn/vault.json"
  mkdir -p "$(dirname "$cfg")"
  cat > "$cfg" <<JSON
{
  "embedding": {
    "baseUrl": "$EMBED_BASE_URL",
    "model": "$EMBED_MODEL",
    "apiKey": "$EMBED_API_KEY",
    "container": { "name": "$EMBED_CONTAINER", "runtime": "$EMBED_RUNTIME" }
  },
  "search": { "fusionAlpha": 0.8 },
  "preprocessor": null
}
JSON
}

tei_container_exists() {
  "$EMBED_RUNTIME" container exists "$EMBED_CONTAINER" 2>/dev/null
}

tei_install() {
  if ! command -v "$EMBED_RUNTIME" >/dev/null; then
    echo "$EMBED_RUNTIME not found in PATH"
    exit 1
  fi

  if tei_container_exists; then
    echo "container '$EMBED_CONTAINER' already exists — skipping"
    return
  fi

  echo "→ creating TEI container '$EMBED_CONTAINER'"
  echo "    image:  $TEI_IMAGE"
  echo "    model:  $EMBED_MODEL"
  echo "    port:   $TEI_PORT → 80"
  echo "    volume: $TEI_VOLUME → /data"
  local gpu_args=()
  if [[ "$TEI_GPU" == "1" ]]; then
    gpu_args=(--device nvidia.com/gpu=all)
    echo "    gpu:    nvidia.com/gpu=all"
  fi
  "$EMBED_RUNTIME" create \
    --name "$EMBED_CONTAINER" \
    -p "$TEI_PORT:80" \
    -v "$TEI_VOLUME:/data" \
    "${gpu_args[@]}" \
    "$TEI_IMAGE" \
    --model-id "$EMBED_MODEL"

  echo
  echo "done. first 'kn add' will auto-start this container (may take a while on"
  echo "first run — TEI downloads the model into the $TEI_VOLUME volume)."
}

tei_remove() {
  if tei_container_exists; then
    echo "→ removing container '$EMBED_CONTAINER'"
    "$EMBED_RUNTIME" rm -f "$EMBED_CONTAINER"
  fi
  if "$EMBED_RUNTIME" volume exists "$TEI_VOLUME" 2>/dev/null; then
    echo "→ removing volume '$TEI_VOLUME'"
    "$EMBED_RUNTIME" volume rm "$TEI_VOLUME"
  fi
  echo "done."
}

setup() {
  if [[ -d "$VAULT_PATH" ]]; then
    echo "test vault already exists at $VAULT_PATH — run teardown first"
    exit 1
  fi

  echo "→ creating test vault at $VAULT_PATH (TEI container auto-created if missing)"
  mkdir -p "$VAULT_PATH"
  local gpu_flag=()
  if [[ "$TEI_GPU" == "1" ]]; then
    gpu_flag=(--tei-gpu)
  fi
  run_kn vault create "$VAULT_NAME" \
    --path "$VAULT_PATH" \
    --model "$EMBED_MODEL" \
    --tei-image "$TEI_IMAGE" \
    --tei-port "$TEI_PORT" \
    --container-name "$EMBED_CONTAINER" \
    --runtime "$EMBED_RUNTIME" \
    "${gpu_flag[@]}"

  echo "→ indexing testdata/"
  run_kn add testdata/ --recursive --vault "$VAULT_NAME"

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
  run_kn get testdata/2026-04-22.md
}

cmd="${1:-}"
shift || true
case "$cmd" in
  tei-install) tei_install ;;
  tei-remove) tei_remove ;;
  setup) setup ;;
  teardown) teardown ;;
  demo) demo ;;
  kn) run_kn "$@" ;;
  *)
    echo "usage: $0 {tei-install|tei-remove|setup|teardown|demo|kn ...}"
    exit 1
    ;;
esac
