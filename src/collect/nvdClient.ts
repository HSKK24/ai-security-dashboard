import { logger } from "../lib/logger";
import { withRetry } from "../lib/retry";
import type { NvdResponse, NvdVulnerability } from "./nvdSchema";
import { nvdResponseSchema } from "./nvdSchema";

const NVD_API_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const PAGE_SIZE = 2000;
// totalResults の不正値による無限ループを防ぐ上限（2000件 × 50 = 10万件）
const MAX_PAGES = 50;

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
  retries?: number;
  baseDelayMs?: number;
  fetchTimeoutMs?: number;
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
): Promise<NvdResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.fetchTimeoutMs ?? FETCH_TIMEOUT_MS;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.apiKey) {
    headers.apiKey = options.apiKey;
  }

  const response = await withRetry(
    async () => {
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
  let startIndex = 0;
  let pageCount = 0;

  for (;;) {
    const params = new URLSearchParams({
      lastModStartDate: range.since,
      lastModEndDate: range.until,
      resultsPerPage: String(PAGE_SIZE),
      startIndex: String(startIndex),
    });
    const page = await requestPage(params, options);
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
