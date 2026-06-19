import { describe, expect, it } from "vitest";
import { enrichRecords } from "../../src/process/enrich";
import type { LLMResult } from "../../src/process/llm/LLMClient";
import { fakeLlmClient, llmOk, makeRecord } from "../helpers/factories";
import malformed from "../fixtures/llm-malformed.json";

const noSleep = async (): Promise<void> => {};
const OPTIONS = { rpmLimit: 600, sleep: noSleep, rateLimitBackoffMs: 1 };

const rateLimit: LLMResult = { ok: false, json: null, error: "rate_limit" };
const timeout: LLMResult = { ok: false, json: null, error: "timeout" };

describe("enrichRecords", () => {
  it("fills summary and category for pending records on success", async () => {
    const { client, calls } = fakeLlmClient([llmOk("日本語の要約。", "prompt-injection")]);
    const { records, carryover } = await enrichRecords([makeRecord()], client, OPTIONS);
    expect(records[0]).toMatchObject({
      summaryJa: "日本語の要約。",
      category: "prompt-injection",
      llmStatus: "ok",
    });
    expect(carryover).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("isolates the description inside delimiter tags in the user prompt", async () => {
    const { client, calls } = fakeLlmClient([llmOk("要約。", "other")]);
    await enrichRecords([makeRecord({ descriptionEn: "Some CVE text." })], client, OPTIONS);
    expect(calls[0]?.userPrompt).toContain("<cve_description>\nSome CVE text.\n</cve_description>");
  });

  it("makes zero LLM calls when all records are ok", async () => {
    const { client, calls } = fakeLlmClient([llmOk("不要", "other")]);
    const records = [makeRecord({ llmStatus: "ok", summaryJa: "既存", category: "other" })];
    const outcome = await enrichRecords(records, client, OPTIONS);
    expect(calls).toHaveLength(0);
    expect(outcome.records).toEqual(records);
    expect(outcome.carryover).toEqual([]);
  });

  it("retries failed records on subsequent runs", async () => {
    const { client, calls } = fakeLlmClient([llmOk("リトライ成功。", "other")]);
    const okRecord = makeRecord({ llmStatus: "ok", summaryJa: "既存", category: "other" });
    const failedRecord = makeRecord({ id: "CVE-2026-0002", llmStatus: "failed" });
    const outcome = await enrichRecords([okRecord, failedRecord], client, OPTIONS);
    expect(calls).toHaveLength(1);
    expect(outcome.records[0]).toEqual(okRecord);
    expect(outcome.records[1]).toMatchObject({
      id: "CVE-2026-0002",
      summaryJa: "リトライ成功。",
      llmStatus: "ok",
    });
    expect(outcome.carryover).toEqual([]);
  });

  it("defers failed records to carryover when budget is exhausted", async () => {
    const { client, calls } = fakeLlmClient([llmOk("1件目。", "other")]);
    const records = [
      makeRecord({ id: "CVE-2026-0001" }),
      makeRecord({ id: "CVE-2026-0002", llmStatus: "failed" }),
    ];
    const outcome = await enrichRecords(records, client, { ...OPTIONS, maxItems: 1 });
    expect(calls).toHaveLength(1);
    expect(outcome.records[0]?.llmStatus).toBe("ok");
    expect(outcome.records[1]?.llmStatus).toBe("failed");
    expect(outcome.carryover).toEqual(["CVE-2026-0002"]);
  });

  it("makes zero LLM calls for an empty record set", async () => {
    const { client, calls } = fakeLlmClient([]);
    const outcome = await enrichRecords([], client, OPTIONS);
    expect(calls).toHaveLength(0);
    expect(outcome.records).toEqual([]);
  });

  it("marks the record failed and falls back when the LLM output is malformed", async () => {
    const { client } = fakeLlmClient([{ ok: true, json: malformed }]);
    const original = makeRecord();
    const { records } = await enrichRecords([original], client, OPTIONS);
    expect(records[0]).toMatchObject({
      summaryJa: null,
      category: null,
      llmStatus: "failed",
      descriptionEn: original.descriptionEn,
    });
  });

  it("marks a timed-out record failed but keeps processing the rest", async () => {
    const { client, calls } = fakeLlmClient([timeout, llmOk("次は成功。", "ai-library")]);
    const records = [makeRecord(), makeRecord({ id: "CVE-2026-0002" })];
    const outcome = await enrichRecords(records, client, OPTIONS);
    expect(outcome.records[0]?.llmStatus).toBe("failed");
    expect(outcome.records[1]).toMatchObject({ llmStatus: "ok", summaryJa: "次は成功。" });
    expect(calls).toHaveLength(2);
    expect(outcome.carryover).toEqual([]);
  });

  it("recovers when a rate limit clears after one backoff", async () => {
    const sleeps: number[] = [];
    const sleep = async (ms: number): Promise<void> => {
      sleeps.push(ms);
    };
    const { client, calls } = fakeLlmClient([rateLimit, llmOk("回復後の要約。", "other")]);
    const { records, carryover } = await enrichRecords([makeRecord()], client, {
      ...OPTIONS,
      sleep,
      rateLimitBackoffMs: 7,
    });
    expect(records[0]?.llmStatus).toBe("ok");
    expect(carryover).toEqual([]);
    expect(calls).toHaveLength(2);
    expect(sleeps).toContain(7);
  });

  it("defers remaining pending records to carryover on a persistent rate limit", async () => {
    const { client, calls } = fakeLlmClient([rateLimit, rateLimit]);
    const records = [
      makeRecord({ id: "CVE-2026-0001" }),
      makeRecord({ id: "CVE-2026-0002" }),
      makeRecord({ id: "CVE-2026-0003" }),
    ];
    const outcome = await enrichRecords(records, client, OPTIONS);
    expect(outcome.carryover).toEqual(["CVE-2026-0001", "CVE-2026-0002", "CVE-2026-0003"]);
    for (const record of outcome.records) {
      expect(record.llmStatus).toBe("pending");
    }
    // バックオフ込みで2回呼んだ後は一切呼ばない（正常終了）
    expect(calls).toHaveLength(2);
  });

  it("respects maxItems and defers the overflow to carryover", async () => {
    const { client, calls } = fakeLlmClient([llmOk("1件目。", "other")]);
    const records = [
      makeRecord({ id: "CVE-2026-0001" }),
      makeRecord({ id: "CVE-2026-0002" }),
      makeRecord({ id: "CVE-2026-0003" }),
    ];
    const outcome = await enrichRecords(records, client, { ...OPTIONS, maxItems: 1 });
    expect(calls).toHaveLength(1);
    expect(outcome.records[0]?.llmStatus).toBe("ok");
    expect(outcome.carryover).toEqual(["CVE-2026-0002", "CVE-2026-0003"]);
  });

  it("does not mutate the input records", async () => {
    const { client } = fakeLlmClient([llmOk("要約。", "other")]);
    const original = makeRecord();
    const snapshot = JSON.parse(JSON.stringify(original));
    await enrichRecords([original], client, OPTIONS);
    expect(original).toEqual(snapshot);
  });
});
