import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  cveRecordSchema,
  indexDataSchema,
  runStatsSchema,
  settingsSchema,
} from "../../src/store/cveSchema";
import { makeRecord } from "../helpers/factories";

describe("cveRecordSchema", () => {
  it("accepts a valid record", () => {
    expect(() => cveRecordSchema.parse(makeRecord())).not.toThrow();
  });

  it("rejects an invalid CVE id", () => {
    expect(cveRecordSchema.safeParse(makeRecord({ id: "NOT-A-CVE" })).success).toBe(false);
  });

  it("rejects an unknown category", () => {
    const record = { ...makeRecord(), category: "made-up-category" };
    expect(cveRecordSchema.safeParse(record).success).toBe(false);
  });

  it("rejects an out-of-range CVSS score", () => {
    expect(cveRecordSchema.safeParse(makeRecord({ cvssScore: 11 })).success).toBe(false);
  });
});

describe("runStatsSchema", () => {
  const statsWithoutFlag = { nvdFetched: 100, keywordMatched: 5, llmEnriched: 3 };
  const validStats = { ...statsWithoutFlag, nvdFetchFailed: false };

  it("accepts stats with nvdFetchFailed", () => {
    expect(() => runStatsSchema.parse(validStats)).not.toThrow();
    expect(() => runStatsSchema.parse({ ...validStats, nvdFetchFailed: true })).not.toThrow();
  });

  it("rejects stats missing nvdFetchFailed", () => {
    expect(runStatsSchema.safeParse(statsWithoutFlag).success).toBe(false);
  });

  it("rejects a non-boolean nvdFetchFailed", () => {
    expect(runStatsSchema.safeParse({ ...validStats, nvdFetchFailed: "yes" }).success).toBe(false);
  });
});

describe("indexDataSchema", () => {
  const indexWithoutFetchAt = {
    lastRunAt: "2026-07-03T00:00:00.000Z",
    totalCount: 0,
    latestModifiedCursor: "",
    carryover: [],
    years: [],
  };
  const validIndex = { ...indexWithoutFetchAt, lastSuccessfulNvdFetchAt: null };

  it("accepts the initial committed index file", async () => {
    const path = fileURLToPath(new URL("../../data/index.json", import.meta.url));
    const raw: unknown = JSON.parse(await readFile(path, "utf8"));
    expect(() => indexDataSchema.parse(raw)).not.toThrow();
  });

  it("rejects a negative totalCount", () => {
    expect(indexDataSchema.safeParse({ ...validIndex, totalCount: -1 }).success).toBe(false);
  });

  it("accepts lastSuccessfulNvdFetchAt as null or an ISO string", () => {
    expect(indexDataSchema.safeParse(validIndex).success).toBe(true);
    expect(
      indexDataSchema.safeParse({
        ...validIndex,
        lastSuccessfulNvdFetchAt: "2026-07-01T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("rejects an index missing lastSuccessfulNvdFetchAt", () => {
    expect(indexDataSchema.safeParse(indexWithoutFetchAt).success).toBe(false);
  });
});

describe("settingsSchema", () => {
  it("accepts the committed config/settings.json", async () => {
    const path = fileURLToPath(new URL("../../config/settings.json", import.meta.url));
    const raw: unknown = JSON.parse(await readFile(path, "utf8"));
    const settings = settingsSchema.parse(raw);
    expect(settings.llm.provider).toBe("gemini");
    expect(settings.keywords.length).toBeGreaterThan(0);
  });

  it("rejects an unknown provider", () => {
    const invalid = {
      keywords: ["LLM"],
      maxItems: 10,
      displayItems: 10,
      llm: { provider: "openai", model: "x", rpmLimit: 10 },
    };
    expect(settingsSchema.safeParse(invalid).success).toBe(false);
  });
});
