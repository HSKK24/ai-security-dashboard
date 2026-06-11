import { describe, expect, it } from "vitest";
import { mergeRecords } from "../../src/process/dedup";
import { makeRecord } from "../helpers/factories";

describe("mergeRecords", () => {
  it("adds records with new ids", () => {
    const existing = [makeRecord({ id: "CVE-2026-0001" })];
    const incoming = [makeRecord({ id: "CVE-2026-0002" })];
    const merged = mergeRecords(existing, incoming);
    expect(merged.map((r) => r.id).sort()).toEqual(["CVE-2026-0001", "CVE-2026-0002"]);
  });

  it("keeps the existing LLM summary when the description is unchanged", () => {
    const existing = [
      makeRecord({
        summaryJa: "既存の要約",
        category: "prompt-injection",
        llmStatus: "ok",
      }),
    ];
    const incoming = [makeRecord({ lastModifiedAt: "2026-06-08T00:00:00.000Z" })];
    const merged = mergeRecords(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      summaryJa: "既存の要約",
      category: "prompt-injection",
      llmStatus: "ok",
      lastModifiedAt: "2026-06-08T00:00:00.000Z",
    });
  });

  it("resets to the incoming pending record when the description changed", () => {
    const existing = [makeRecord({ summaryJa: "古い要約", llmStatus: "ok" })];
    const incoming = [makeRecord({ descriptionEn: "Updated description with new details." })];
    const merged = mergeRecords(existing, incoming);
    expect(merged[0]).toMatchObject({ summaryJa: null, llmStatus: "pending" });
  });

  it("sorts the result by publishedAt descending", () => {
    const existing = [makeRecord({ id: "CVE-2026-0001", publishedAt: "2026-01-01T00:00:00.000Z" })];
    const incoming = [makeRecord({ id: "CVE-2026-0002", publishedAt: "2026-05-01T00:00:00.000Z" })];
    const merged = mergeRecords(existing, incoming);
    expect(merged.map((r) => r.id)).toEqual(["CVE-2026-0002", "CVE-2026-0001"]);
  });

  it("does not mutate its inputs", () => {
    const existing = [makeRecord({ id: "CVE-2026-0001" })];
    const incoming = [makeRecord({ id: "CVE-2026-0001", summaryJa: null })];
    const existingSnapshot = JSON.parse(JSON.stringify(existing));
    const incomingSnapshot = JSON.parse(JSON.stringify(incoming));
    mergeRecords(existing, incoming);
    expect(existing).toEqual(existingSnapshot);
    expect(incoming).toEqual(incomingSnapshot);
  });
});
