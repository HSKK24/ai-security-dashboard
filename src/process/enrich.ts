import { RateLimiter, intervalForRpm } from "../collect/rateLimiter";
import { logger } from "../lib/logger";
import { defaultSleep } from "../lib/retry";
import type { CveRecord } from "../store/cveSchema";
import type { LLMClient, LLMRequest, LLMResult } from "./llm/LLMClient";
import { RESPONSE_SCHEMA, SYSTEM_PROMPT, buildUserPrompt, llmOutputSchema } from "./llm/prompt";

const RATE_LIMIT_BACKOFF_MS = 65_000;

export interface EnrichOptions {
  rpmLimit: number;
  /** 1回の実行でLLMに送る最大件数（無料枠保護） */
  maxItems?: number;
  rateLimitBackoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface EnrichOutcome {
  records: CveRecord[];
  carryover: string[];
}

async function completeWithBackoff(
  client: LLMClient,
  request: LLMRequest,
  sleep: (ms: number) => Promise<void>,
  backoffMs: number,
): Promise<LLMResult> {
  const first = await client.complete(request);
  if (first.error !== "rate_limit") {
    return first;
  }
  await sleep(backoffMs);
  return client.complete(request);
}

function applyLlmResult(record: CveRecord, result: LLMResult): CveRecord {
  const parsed = llmOutputSchema.safeParse(result.json);
  if (!parsed.success) {
    // 不正なLLM出力は採用せず、画面側ではdescriptionEn原文にフォールバックする
    logger.warn(`LLM output failed validation for ${record.id}; falling back to original text`);
    return { ...record, summaryJa: null, category: null, llmStatus: "failed" };
  }
  return {
    ...record,
    summaryJa: parsed.data.summaryJa,
    category: parsed.data.category,
    llmStatus: "ok",
  };
}

export async function enrichRecords(
  records: readonly CveRecord[],
  client: LLMClient,
  options: EnrichOptions,
): Promise<EnrichOutcome> {
  const sleep = options.sleep ?? defaultSleep;
  const backoffMs = options.rateLimitBackoffMs ?? RATE_LIMIT_BACKOFF_MS;
  const maxItems = options.maxItems ?? Number.POSITIVE_INFINITY;
  const limiter = new RateLimiter(intervalForRpm(options.rpmLimit), {
    sleep,
    now: options.now,
  });

  const enriched: CveRecord[] = [];
  const carryover: string[] = [];
  let llmCalls = 0;
  let rateLimited = false;

  for (const record of records) {
    if (record.llmStatus === "ok") {
      enriched.push(record);
      continue;
    }
    if (rateLimited || llmCalls >= maxItems) {
      enriched.push(record);
      carryover.push(record.id);
      continue;
    }

    llmCalls += 1;
    await limiter.wait();
    const request: LLMRequest = {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(record.descriptionEn),
      responseSchema: RESPONSE_SCHEMA,
    };
    const result = await completeWithBackoff(client, request, sleep, backoffMs);

    if (result.ok) {
      enriched.push(applyLlmResult(record, result));
      continue;
    }
    if (result.error === "rate_limit") {
      rateLimited = true;
      logger.warn(`LLM rate limit hit at ${record.id}; deferring remaining records to next run`);
      enriched.push(record);
      carryover.push(record.id);
      continue;
    }
    logger.warn(`LLM call failed for ${record.id} (${result.error ?? "unknown"})`);
    enriched.push({ ...record, llmStatus: "failed" });
  }

  return { records: enriched, carryover };
}
