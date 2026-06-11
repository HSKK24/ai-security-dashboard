import { logger } from "../lib/logger";
import { withRetry } from "../lib/retry";
import type { NvdResponse, NvdVulnerability } from "./nvdSchema";
import { nvdResponseSchema } from "./nvdSchema";

const NVD_API_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const PAGE_SIZE = 2000;

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
}

function isRetryable(error: unknown): boolean {
  return error instanceof NvdApiError && (error.status === 429 || error.status >= 500);
}

async function requestPage(
  params: URLSearchParams,
  options: NvdClientOptions,
): Promise<NvdResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.apiKey) {
    headers.apiKey = options.apiKey;
  }

  const response = await withRetry(
    async () => {
      const res = await fetchImpl(`${NVD_API_URL}?${params.toString()}`, { headers });
      if (res.status === 429) {
        throw new NvdRateLimitError();
      }
      if (!res.ok) {
        throw new NvdApiError(res.status);
      }
      return res;
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
  let collected: NvdVulnerability[] = [];
  let startIndex = 0;

  for (;;) {
    const params = new URLSearchParams({
      lastModStartDate: range.since,
      lastModEndDate: range.until,
      resultsPerPage: String(PAGE_SIZE),
      startIndex: String(startIndex),
    });
    const page = await requestPage(params, options);
    collected = [...collected, ...page.vulnerabilities];
    startIndex += page.vulnerabilities.length;
    if (page.vulnerabilities.length === 0 || startIndex >= page.totalResults) {
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
