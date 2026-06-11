import { describe, expect, it } from "vitest";
import {
  englishDescription,
  filterByKeywords,
  matchesKeywords,
} from "../../src/collect/keywordFilter";
import { nvdResponseSchema } from "../../src/collect/nvdSchema";
import sample from "../fixtures/nvd-sample.json";

const KEYWORDS = ["machine learning", "LLM", "GPT", "prompt injection"];

describe("matchesKeywords", () => {
  it("matches phrases case-insensitively", () => {
    expect(matchesKeywords("A Machine Learning pipeline flaw", KEYWORDS)).toBe(true);
  });

  it("matches short acronyms only on word boundaries", () => {
    expect(matchesKeywords("the GPT-4 based assistant", ["GPT"])).toBe(true);
    expect(matchesKeywords("EGPTX is unrelated", ["GPT"])).toBe(false);
  });

  it("does not match unrelated text", () => {
    expect(matchesKeywords("SQL injection in a CMS", KEYWORDS)).toBe(false);
  });

  it("escapes regex special characters in keywords", () => {
    expect(matchesKeywords("uses node.js runtime", ["node.js"])).toBe(true);
    expect(matchesKeywords("uses nodeXjs runtime", ["node.js"])).toBe(false);
  });
});

describe("filterByKeywords", () => {
  it("keeps only AI-related CVEs from the NVD sample", () => {
    const response = nvdResponseSchema.parse(sample);
    const filtered = filterByKeywords(response.vulnerabilities, KEYWORDS);
    expect(filtered.map((v) => v.cve.id)).toEqual(["CVE-2026-0001", "CVE-2026-0002"]);
  });
});

describe("englishDescription", () => {
  it("returns the english description when present", () => {
    const response = nvdResponseSchema.parse(sample);
    expect(englishDescription(response.vulnerabilities[0]!)).toContain("prompt injection");
  });

  it("returns an empty string when no english description exists", () => {
    const vuln = {
      cve: {
        id: "CVE-2026-9999",
        published: "2026-01-01T00:00:00.000",
        lastModified: "2026-01-01T00:00:00.000",
        descriptions: [{ lang: "es", value: "solo espanol" }],
      },
    };
    expect(englishDescription(vuln)).toBe("");
  });
});
