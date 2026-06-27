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
    const stats = aggregate(records, {
      displayDays: 30,
      generatedAt: GENERATED_AT,
      now: GENERATED_AT,
      lastRunAt: GENERATED_AT,
    });
    expect(stats.severityCounts.HIGH).toBe(2);
    expect(stats.severityCounts.UNKNOWN).toBe(1);
    expect(stats.severityCounts.CRITICAL).toBe(0);
  });

  it("counts categories including unclassified", () => {
    const stats = aggregate(records, {
      displayDays: 30,
      generatedAt: GENERATED_AT,
      now: GENERATED_AT,
      lastRunAt: GENERATED_AT,
    });
    expect(stats.categoryCounts["prompt-injection"]).toBe(1);
    expect(stats.categoryCounts["ai-library"]).toBe(1);
    expect(stats.categoryCounts.unclassified).toBe(1);
  });

  it("sorts recent records by publishedAt descending", () => {
    const stats = aggregate(records, {
      displayDays: 30,
      generatedAt: GENERATED_AT,
      now: GENERATED_AT,
      lastRunAt: GENERATED_AT,
    });
    expect(stats.recent.map((r) => r.id)).toEqual([
      "CVE-2026-0002",
      "CVE-2026-0003",
      "CVE-2026-0001",
    ]);
    expect(stats.totalCount).toBe(3);
    expect(stats.generatedAt).toBe(GENERATED_AT);
  });

  it("excludes records older than displayDays", () => {
    const oldRecord = makeRecord({
      id: "CVE-2026-OLD",
      publishedAt: "2026-04-01T00:00:00.000Z", // 70 days before GENERATED_AT
    });
    // totalCount counts all records; recent only shows within the window
    const stats = aggregate([...records, oldRecord], {
      displayDays: 30,
      generatedAt: GENERATED_AT,
      now: GENERATED_AT,
      lastRunAt: GENERATED_AT,
    });
    expect(stats.recent.map((r) => r.id)).not.toContain("CVE-2026-OLD");
    expect(stats.recent).toHaveLength(3);
    expect(stats.totalCount).toBe(4);
  });

  it("does not mutate the input order", () => {
    const before = records.map((r) => r.id);
    aggregate(records, {
      displayDays: 30,
      generatedAt: GENERATED_AT,
      now: GENERATED_AT,
      lastRunAt: GENERATED_AT,
    });
    expect(records.map((r) => r.id)).toEqual(before);
  });

  it("passes through lastRunAt and lastRunStats", () => {
    const stats = aggregate(records, {
      displayDays: 30,
      generatedAt: GENERATED_AT,
      now: GENERATED_AT,
      lastRunAt: "2026-06-27 07:01 JST",
      lastRunStats: { nvdFetched: 892, keywordMatched: 3, llmEnriched: 3 },
    });
    expect(stats.lastRunAt).toBe("2026-06-27 07:01 JST");
    expect(stats.lastRunStats).toEqual({ nvdFetched: 892, keywordMatched: 3, llmEnriched: 3 });
  });

  it("defaults lastRunStats to null when omitted", () => {
    const stats = aggregate(records, {
      displayDays: 30,
      generatedAt: GENERATED_AT,
      now: GENERATED_AT,
      lastRunAt: "未実行",
    });
    expect(stats.lastRunStats).toBeNull();
    expect(stats.lastRunAt).toBe("未実行");
  });

  it("handles an empty record set", () => {
    const stats = aggregate([], {
      displayDays: 30,
      generatedAt: GENERATED_AT,
      now: GENERATED_AT,
      lastRunAt: GENERATED_AT,
    });
    expect(stats.totalCount).toBe(0);
    expect(stats.recent).toEqual([]);
    expect(stats.severityCounts.HIGH).toBe(0);
  });
});
