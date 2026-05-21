import { join } from "node:path";
import { randomUUID } from "node:crypto";

export function testOutputPath(...segments: string[]): string {
  return join(process.cwd(), "..", ".test-output", "cli", ...segments);
}

export function randomTestPath(prefix: string): string {
  return testOutputPath(`${prefix}-${randomUUID()}`);
}
