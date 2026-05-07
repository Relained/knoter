import { describe, expect, test } from "bun:test";
import { normalizeSemanticScore, resolveHybridAlpha } from "../src/search/hybrid";
import { resolveHybridMinOption } from "../src/commands/search";

describe("search quality helpers", () => {
  test("normalizes zvec distance to similarity", () => {
    expect(normalizeSemanticScore(0)).toBe(1);
    expect(normalizeSemanticScore(0.2)).toBe(0.8);
    expect(normalizeSemanticScore(1)).toBe(0);
  });

  test("resolves hybrid alpha with explicit option precedence", () => {
    expect(resolveHybridAlpha(0.3, 0.9)).toBe(0.3);
    expect(resolveHybridAlpha(undefined, 0.65)).toBe(0.65);
    expect(resolveHybridAlpha(undefined, undefined)).toBe(0.8);
  });

  test("maps deprecated threshold alias to hybridMin unless hybridMin exists", () => {
    expect(resolveHybridMinOption({ threshold: "0.4" })).toBe(0.4);
    expect(resolveHybridMinOption({ hybridMin: "0.7", threshold: "0.4" })).toBe(0.7);
    expect(resolveHybridMinOption({ hybridMin: "abc" })).toBeUndefined();
  });
});
