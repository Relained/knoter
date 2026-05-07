import { test, expect } from "bun:test";
import { parseNote } from "../src/pipeline/parser";

test("parseNote stores explicit kind only", () => {
  const explicit = parseNote(
    `---
kind: daily-report
date: 2026-05-08
---
# Report
`,
    "rewritten/2026-05-08/report.md",
  );

  expect(explicit.kind).toBe("daily-report");
  expect(explicit.docDate).toBe("2026-05-08");
  expect(explicit.layer).toBe("rewritten");

  const inferred = parseNote(
    "# 운동 todo daily\n본문",
    "rewritten/2026-05-09/workout-todo-daily.md",
  );

  expect(inferred.kind).toBeNull();
  expect(inferred.docDate).toBe("2026-05-09");
  expect(inferred.layer).toBe("rewritten");
});
