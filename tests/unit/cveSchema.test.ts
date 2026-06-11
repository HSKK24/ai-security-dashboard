import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cveRecordSchema, indexDataSchema, settingsSchema } from "../../src/store/cveSchema";
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

describe("indexDataSchema", () => {
  it("accepts the initial committed index file", async () => {
    const path = fileURLToPath(new URL("../../data/index.json", import.meta.url));
    const raw: unknown = JSON.parse(await readFile(path, "utf8"));
    expect(() => indexDataSchema.parse(raw)).not.toThrow();
  });

  it("rejects a negative totalCount", () => {
    const invalid = {
      lastRunAt: "",
      totalCount: -1,
      latestModifiedCursor: "",
      carryover: [],
      years: [],
    };
    expect(indexDataSchema.safeParse(invalid).success).toBe(false);
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
