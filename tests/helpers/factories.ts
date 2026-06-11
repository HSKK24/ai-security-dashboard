import type { CveRecord } from "../../src/store/cveSchema";
import type { LLMClient, LLMRequest, LLMResult } from "../../src/process/llm/LLMClient";

export function makeRecord(overrides: Partial<CveRecord> = {}): CveRecord {
  return {
    id: "CVE-2026-0001",
    sourceUrl: "https://nvd.nist.gov/vuln/detail/CVE-2026-0001",
    descriptionEn: "A prompt injection vulnerability in an LLM application.",
    summaryJa: null,
    category: null,
    cvssScore: 8.1,
    severity: "HIGH",
    publishedAt: "2026-06-01T10:00:00.000Z",
    lastModifiedAt: "2026-06-05T12:00:00.000Z",
    fetchedAt: "2026-06-10T00:00:00.000Z",
    llmStatus: "pending",
    ...overrides,
  };
}

export interface FakeLlm {
  client: LLMClient;
  calls: LLMRequest[];
}

/** 渡したLLMResultを順番に返すフェイククライアント（末尾以降は最後の値を返す） */
export function fakeLlmClient(results: readonly LLMResult[]): FakeLlm {
  const calls: LLMRequest[] = [];
  let index = 0;
  const fallback: LLMResult = { ok: false, json: null, error: "unknown" };
  const client: LLMClient = {
    complete: (req) => {
      calls.push(req);
      const result = results[Math.min(index, results.length - 1)] ?? fallback;
      index += 1;
      return Promise.resolve(result);
    },
  };
  return { client, calls };
}

export function llmOk(summaryJa: string, category: string): LLMResult {
  return { ok: true, json: { summaryJa, category } };
}
