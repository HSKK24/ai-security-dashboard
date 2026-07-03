import { describe, expect, it } from "vitest";
import { prioritizeCarryover } from "../../src/process/prioritize";
import { makeRecord } from "../helpers/factories";

describe("prioritizeCarryover", () => {
  it("moves carryover records with pending/failed status to the front", () => {
    const records = [
      makeRecord({ id: "CVE-2026-0001", llmStatus: "ok" }),
      makeRecord({ id: "CVE-2026-0002", llmStatus: "pending" }),
      makeRecord({ id: "CVE-2026-0003", llmStatus: "failed" }),
    ];
    const result = prioritizeCarryover(records, new Set(["CVE-2026-0002", "CVE-2026-0003"]));
    expect(result.map((r) => r.id)).toEqual(["CVE-2026-0002", "CVE-2026-0003", "CVE-2026-0001"]);
  });

  it("does not prioritize carryover records that are already enriched", () => {
    const records = [
      makeRecord({ id: "CVE-2026-0001", llmStatus: "pending" }),
      makeRecord({ id: "CVE-2026-0002", llmStatus: "ok" }),
    ];
    const result = prioritizeCarryover(records, new Set(["CVE-2026-0002"]));
    expect(result.map((r) => r.id)).toEqual(["CVE-2026-0001", "CVE-2026-0002"]);
  });

  it("keeps the relative order of non-carryover records", () => {
    const records = [
      makeRecord({ id: "CVE-2026-0001", llmStatus: "pending" }),
      makeRecord({ id: "CVE-2026-0002", llmStatus: "failed" }),
      makeRecord({ id: "CVE-2026-0003", llmStatus: "pending" }),
      makeRecord({ id: "CVE-2026-0004", llmStatus: "ok" }),
    ];
    const result = prioritizeCarryover(records, new Set(["CVE-2026-0003"]));
    expect(result.map((r) => r.id)).toEqual([
      "CVE-2026-0003",
      "CVE-2026-0001",
      "CVE-2026-0002",
      "CVE-2026-0004",
    ]);
  });

  it("keeps the original order when the carryover set is empty", () => {
    const records = [
      makeRecord({ id: "CVE-2026-0001", llmStatus: "pending" }),
      makeRecord({ id: "CVE-2026-0002", llmStatus: "failed" }),
      makeRecord({ id: "CVE-2026-0003", llmStatus: "ok" }),
    ];
    const result = prioritizeCarryover(records, new Set());
    expect(result.map((r) => r.id)).toEqual(["CVE-2026-0001", "CVE-2026-0002", "CVE-2026-0003"]);
  });

  it("does not mutate its inputs", () => {
    const records = [
      makeRecord({ id: "CVE-2026-0001", llmStatus: "ok" }),
      makeRecord({ id: "CVE-2026-0002", llmStatus: "pending" }),
    ];
    const carryoverIds = new Set(["CVE-2026-0002"]);
    const recordsSnapshot = JSON.parse(JSON.stringify(records));
    prioritizeCarryover(records, carryoverIds);
    expect(records).toEqual(recordsSnapshot);
    expect(carryoverIds).toEqual(new Set(["CVE-2026-0002"]));
  });
});
