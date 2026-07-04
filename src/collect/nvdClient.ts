import { logger } from "../lib/logger";
import { withRetry } from "../lib/retry";
import { RateLimiter, intervalForRpm } from "./rateLimiter";
import type { NvdResponse, NvdVulnerability } from "./nvdSchema";
import { nvdResponseSchema } from "./nvdSchema";

const NVD_API_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const PAGE_SIZE = 2000;
// totalResults の不正値による無限ループを防ぐ上限（2000件 × 50 = 10万件）
const MAX_PAGES = 50;
// NVD公式レート制限（キーあり50req/30s、なし5req/30s）に安全マージンを乗せた値
const NVD_RPM_WITH_KEY = 90;
const NVD_RPM_WITHOUT_KEY = 8;
// CIジョブの30分タイムアウトを圧迫しないよう、収集フェーズ全体の締切
const COLLECTION_DEADLINE_MS = 600_000;

export class NvdApiError extends Error {
  constructor(
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `NVD API responded with status ${status}`);
    this.name = "NvdApiError";
  }
}

export class NvdRateLimitError extends NvdApiError {
  constructor() {
    super(429, "NVD API rate limit exceeded");
    this.name = "NvdRateLimitError";
  }
}

export interface NvdClientOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  retries?: number;
  baseDelayMs?: number;
  fetchTimeoutMs?: number;
  collectionDeadlineMs?: number;
}

const FETCH_TIMEOUT_MS = 30_000;

function isRetryable(error: unknown): boolean {
  if (error instanceof NvdApiError && (error.status === 429 || error.status >= 500)) {
    return true;
  }
  // AbortError はタイムアウト起因の一時的な失敗として扱いリトライする
  return error instanceof Error && error.name === "AbortError";
}

async function requestPage(
  params: URLSearchParams,
  options: NvdClientOptions,
  limiter?: RateLimiter,
): Promise<NvdResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.fetchTimeoutMs ?? FETCH_TIMEOUT_MS;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.apiKey) {
    headers.apiKey = options.apiKey;
  }

  const response = await withRetry(
    async () => {
      // リトライによる再アクセスも含め、全fetchにレート制御を適用する
      await limiter?.wait();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(`${NVD_API_URL}?${params.toString()}`, {
          headers,
          signal: controller.signal,
        });
        if (res.status === 429) {
          throw new NvdRateLimitError();
        }
        if (!res.ok) {
          throw new NvdApiError(res.status);
        }
        return res;
      } finally {
        clearTimeout(timer);
      }
    },
    {
      retries: options.retries ?? 3,
      baseDelayMs: options.baseDelayMs ?? 2000,
      sleep: options.sleep,
      shouldRetry: isRetryable,
      onRetry: (attempt, error) => {
        const reason = error instanceof Error ? error.message : String(error);
        logger.warn(`NVD request retry #${attempt}: ${reason}`);
      },
    },
  );

  const body: unknown = await response.json();
  const parsed = nvdResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`NVD response validation failed: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function fetchModifiedCves(
  range: { since: string; until: string },
  options: NvdClientOptions = {},
): Promise<NvdVulnerability[]> {
  const collected: NvdVulnerability[] = [];
  const rpm = options.apiKey ? NVD_RPM_WITH_KEY : NVD_RPM_WITHOUT_KEY;
  const limiter = new RateLimiter(intervalForRpm(rpm), {
    sleep: options.sleep,
    now: options.now,
  });
  const now = options.now ?? Date.now;
  const deadlineMs = options.collectionDeadlineMs ?? COLLECTION_DEADLINE_MS;
  const startedAt = now();
  let startIndex = 0;
  let pageCount = 0;

  for (;;) {
    if (now() - startedAt > deadlineMs) {
      logger.warn(
        `NVD collection deadline (${deadlineMs}ms) exceeded; stopping early with ${pageCount} pages fetched`,
      );
      return collected;
    }
    const params = new URLSearchParams({
      lastModStartDate: range.since,
      lastModEndDate: range.until,
      resultsPerPage: String(PAGE_SIZE),
      startIndex: String(startIndex),
    });
    const page = await requestPage(params, options, limiter);
    collected.push(...page.vulnerabilities);
    startIndex += page.vulnerabilities.length;
    if (page.vulnerabilities.length === 0 || startIndex >= page.totalResults) {
      return collected;
    }
    pageCount += 1;
    if (pageCount >= MAX_PAGES) {
      logger.warn(`NVD pagination exceeded ${MAX_PAGES} pages; stopping early`);
      return collected;
    }
  }
}

export async function fetchCveById(
  cveId: string,
  options: NvdClientOptions = {},
): Promise<NvdVulnerability | null> {
  const params = new URLSearchParams({ cveId });
  const page = await requestPage(params, options);
  return page.vulnerabilities[0] ?? null;
}
