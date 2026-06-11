import { describe, expect, it } from "vitest";
import { aggregate } from "../../src/build/aggregate";
import { makeRecord } from "../helpers/factories";

const GENERATED_AT = "2026-06-10T22:00:00.000Z";

describe("aggregate", () => {
  const records = [
    makeRecord({
      id: "CVE-2026-0001",
      severity: "HIGH",
      category: "prompt-injection",
      publishedAt: "2026-06-01T00:00:00.000Z",
    }),
    makeRecord({
      id: "CVE-2026-0002",
      severity: "HIGH",
      category: "ai-library",
      publishedAt: "2026-06-03T00:00:00.000Z",
    }),
    makeRecord({
      id: "CVE-2026-0003",
      severity: null,
      category: null,
      publishedAt: "2026-06-02T00:00:00.000Z",
    }),
  ];

  it("counts severities including UNKNOWN", () => {
    const stats = aggregate(records, { displayItems: 10, generatedAt: GENERATED_AT });
    expect(stats.severityCounts.HIGH).toBe(2);
    expect(stats.severityCounts.UNKNOWN).toBe(1);
    expect(stats.severityCounts.CRITICAL).toBe(0);
  });

  it("counts categories including unclassified", () => {
    const stats = aggregate(records, { displayItems: 10, generatedAt: GENERATED_AT });
    expect(stats.categoryCounts["prompt-injection"]).toBe(1);
    expect(stats.categoryCounts["ai-library"]).toBe(1);
    expect(stats.categoryCounts.unclassified).toBe(1);
  });

  it("limits and sorts recent records by publishedAt descending", () => {
    const stats = aggregate(records, { displayItems: 2, generatedAt: GENERATED_AT });
    expect(stats.recent.map((r) => r.id)).toEqual(["CVE-2026-0002", "CVE-2026-0003"]);
    expect(stats.totalCount).toBe(3);
    expect(stats.generatedAt).toBe(GENERATED_AT);
  });

  it("does not mutate the input order", () => {
    const before = records.map((r) => r.id);
    aggregate(records, { displayItems: 1, generatedAt: GENERATED_AT });
    expect(records.map((r) => r.id)).toEqual(before);
  });

  it("handles an empty record set", () => {
    const stats = aggregate([], { displayItems: 10, generatedAt: GENERATED_AT });
    expect(stats.totalCount).toBe(0);
    expect(stats.recent).toEqual([]);
    expect(stats.severityCounts.HIGH).toBe(0);
  });
});
