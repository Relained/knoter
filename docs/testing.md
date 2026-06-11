# knoter testing and environment

테스트 스위트(`cli/tests/`)는 재구성과 함께 제거됐다. 재도입 전까지
커버리지를 주장하지 않는다. 현재 기준은 typecheck + build + 수동 스모크다.

## Configuration

환경변수 방식은 폐기됐다. 설정은 파일로만 한다:

- 전역: `~/.config/knoter/config.json` — vault 레지스트리, `defaultVaultDir`,
  `agent.backends`/`agent.backend`, embedding 기본값, `sync.intervalMinutes`.
  처음 실행 시 기본값으로 생성된다.
- vault별: `<vault>/config.json` — embedding/agent/search 부분 오버라이드.

스모크 시 머신 전역 config가 그대로 쓰이므로, 테스트 vault는 `kn vault
delete <name> --confirm`으로 레지스트리에서 정리한다 (`.db`만 삭제되고 유저
파일은 남는다 — 임시 경로면 디렉토리째 지우면 된다).

## Verification Commands

```bash
cd cli && bunx tsc --noEmit
cd web && npm run check
```

## Manual Smoke

소스 투입 → sync 인덱싱/큐 → 검색 → 에이전트 패스 순서로 확인한다:

```bash
cd cli

# 1. vault 생성 (templates/ 시딩 포함; 기본 위치는 ~/Documents/<name>)
bun run src/cli.ts vault init smoke --path /tmp/kn-smoke \
  --model dragonkue/snowflake-arctic-embed-l-v2.0-ko

# 2. source 투입 후 인덱스+큐 (에이전트 생략)
mkdir -p /tmp/kn-smoke/sources/$(date +%F)
echo '# memo' > /tmp/kn-smoke/sources/$(date +%F)/memo.md
bun run src/cli.ts sync --no-agent --format json
# -> index.added=1, index.queued=1, queue.remaining=1

# 3. 키워드 검색 (sources scope; 임베딩 불필요)
bun run src/cli.ts search "memo" --scope sources --format json

# 4. 기본 hybrid 검색은 llm-wiki 한정 + embedding endpoint 필요
#    (artifacts/llm-wiki.md가 인덱싱된 후에 결과가 나온다)
bun run src/cli.ts search "memo" --format json

# 5. 에이전트 패스: 전역 config의 agent.backend를 설정하면 sync가 spawn한다.
#    백엔드 미설정이면 agent.skippedReason으로 보고되고 큐는 유지된다.
bun run src/cli.ts sync --format json

# 정리
bun run src/cli.ts vault delete smoke --confirm
rm -rf /tmp/kn-smoke
```

동작 메모:

- `kn vault status`/`kn search` 앞단의 implicit sync는 meta.db `sync_state`로
  10초 debounce된다. 직후 재실행 시 파일 변경이 안 보이면 debounce 때문이다.
- llm-wiki 임베딩과 기본(hybrid/semantic) 검색은 embedding endpoint
  (`http://127.0.0.1:39280` 기본)가 살아 있어야 한다. source/일반 artifact
  인덱싱과 키워드 검색, 큐 적재는 endpoint 없이 동작한다 (llm-wiki 인덱싱
  실패는 sync 결과의 `errors`에 기록되고 다음 sync에서 재시도된다).
- macOS Metal 가속 로컬 TEI는 별도 터미널에서 직접 띄운다:
  `text-embeddings-router --model-id <model> --port 39280`.

## Service (launchd)

```bash
bun run src/cli.ts service status --check   # 등록 상태 + endpoint probe
bun run src/cli.ts service install --interval 10
bun run src/cli.ts service uninstall
```

`install`은 `~/Library/LaunchAgents/com.knoter.sync.plist`를 쓰고 launchctl로
로드한다. 로그는 `~/.config/knoter/logs/`. 실제 등록이 필요 없는 스모크에서는
실행하지 않는다.

## Web verification

```bash
cd web
npm run check
npm run dev   # Vite(127.0.0.1:39281) + Electron shell, active vault 사용
```

Web unit test와 Playwright E2E harness는 제거된 상태다.
