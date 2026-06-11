import { describe, expect, it } from "vitest";
import { nvdResponseSchema } from "../../src/collect/nvdSchema";
import { normalizeAll, normalizeVulnerability } from "../../src/process/normalize";
import { cveRecordSchema } from "../../src/store/cveSchema";
import sample from "../fixtures/nvd-sample.json";

const FETCHED_AT = "2026-06-10T22:00:00.000Z";
const response = nvdResponseSchema.parse(sample);

describe("normalizeVulnerability", () => {
  it("maps NVD fields into a pending CveRecord", () => {
    const record = normalizeVulnerability(response.vulnerabilities[0]!, FETCHED_AT);
    expect(record).toMatchObject({
      id: "CVE-2026-0001",
      sourceUrl: "https://nvd.nist.gov/vuln/detail/CVE-2026-0001",
      summaryJa: null,
      category: null,
      cvssScore: 8.1,
      severity: "HIGH",
      publishedAt: "2026-06-01T10:00:00.000Z",
      lastModifiedAt: "2026-06-05T12:00:00.000Z",
      fetchedAt: FETCHED_AT,
      llmStatus: "pending",
    });
    expect(record.descriptionEn).toContain("prompt injection");
  });

  it("falls back to CVSS v2 metrics when v3 is absent", () => {
    const record = normalizeVulnerability(response.vulnerabilities[1]!, FETCHED_AT);
    expect(record.cvssScore).toBe(6.8);
    expect(record.severity).toBe("MEDIUM");
  });

  it("uses nulls when no metrics are present", () => {
    const record = normalizeVulnerability(response.vulnerabilities[2]!, FETCHED_AT);
    expect(record.cvssScore).toBeNull();
    expect(record.severity).toBeNull();
  });
});

describe("normalizeAll", () => {
  it("produces records that pass the storage schema", () => {
    const records = normalizeAll(response.vulnerabilities, FETCHED_AT);
    expect(records).toHaveLength(3);
    for (const record of records) {
      expect(() => cveRecordSchema.parse(record)).not.toThrow();
    }
  });
});
