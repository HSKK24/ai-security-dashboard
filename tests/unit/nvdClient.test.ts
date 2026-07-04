import { describe, expect, it } from "vitest";
import {
  NvdApiError,
  NvdRateLimitError,
  fetchCveById,
  fetchModifiedCves,
} from "../../src/collect/nvdClient";
import emptyFixture from "../fixtures/nvd-empty.json";
import sampleFixture from "../fixtures/nvd-sample.json";

const RANGE = { since: "2026-06-01T00:00:00.000Z", until: "2026-06-10T00:00:00.000Z" };

interface RecordedCall {
  url: string;
  init?: RequestInit;
}

function fetchStub(factories: ReadonlyArray<() => Response>): {
  fetchImpl: typeof fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  let index = 0;
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const factory = factories[Math.min(index, factories.length - 1)];
    index += 1;
    if (!factory) {
      throw new Error("no response configured");
    }
    return factory();
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function jsonResponse(body: unknown, status = 200): () => Response {
  return () => new Response(JSON.stringify(body), { status });
}

function statusResponse(status: number): () => Response {
  return () => new Response("", { status });
}

const noSleep = async (): Promise<void> => {};

function minimalVuln(id: string) {
  return {
    cve: {
      id,
      published: "2026-06-01T00:00:00.000",
      lastModified: "2026-06-02T00:00:00.000",
      descriptions: [{ lang: "en", value: `description of ${id}` }],
    },
  };
}

describe("fetchModifiedCves", () => {
  it("returns all vulnerabilities from a single page", async () => {
    const { fetchImpl } = fetchStub([jsonResponse(sampleFixture)]);
    const result = await fetchModifiedCves(RANGE, { fetchImpl, sleep: noSleep });
    expect(result.map((v) => v.cve.id)).toEqual([
      "CVE-2026-0001",
      "CVE-2026-0002",
      "CVE-2026-0003",
    ]);
  });

  it("returns an empty array when NVD has no new CVEs", async () => {
    const { fetchImpl } = fetchStub([jsonResponse(emptyFixture)]);
    const result = await fetchModifiedCves(RANGE, { fetchImpl, sleep: noSleep });
    expect(result).toEqual([]);
  });

  it("paginates until totalResults is reached", async () => {
    const page1 = {
      resultsPerPage: 2,
      startIndex: 0,
      totalResults: 3,
      vulnerabilities: [minimalVuln("CVE-2026-0001"), minimalVuln("CVE-2026-0002")],
    };
    const page2 = {
      resultsPerPage: 1,
      startIndex: 2,
      totalResults: 3,
      vulnerabilities: [minimalVuln("CVE-2026-0003")],
    };
    const { fetchImpl, calls } = fetchStub([jsonResponse(page1), jsonResponse(page2)]);
    const result = await fetchModifiedCves(RANGE, { fetchImpl, sleep: noSleep });
    expect(result).toHaveLength(3);
    expect(calls[1]?.url).toContain("startIndex=2");
  });

  it("stops early when pagination exceeds the page limit", async () => {
    // totalResults が不正に大きい値を返し続けても無限ループしないことを確認する
    const bogusPage = {
      resultsPerPage: 1,
      startIndex: 0,
      totalResults: 999_999_999,
      vulnerabilities: [minimalVuln("CVE-2026-0001")],
    };
    const { fetchImpl, calls } = fetchStub([jsonResponse(bogusPage)]);
    const result = await fetchModifiedCves(RANGE, { fetchImpl, sleep: noSleep });
    expect(calls).toHaveLength(50);
    expect(result).toHaveLength(50);
  });

  it("backs off and recovers from transient 429 responses", async () => {
    const sleeps: number[] = [];
    const sleep = async (ms: number): Promise<void> => {
      sleeps.push(ms);
    };
    const { fetchImpl, calls } = fetchStub([
      statusResponse(429),
      statusResponse(429),
      jsonResponse(emptyFixture),
    ]);
    const result = await fetchModifiedCves(RANGE, { fetchImpl, sleep, baseDelayMs: 10 });
    expect(result).toEqual([]);
    expect(calls).toHaveLength(3);
    // レートリミッタ由来の待機（数千ms）を除外し、バックオフの待機だけを検証する
    expect(sleeps.filter((ms) => ms < 1000)).toEqual([10, 20]);
  });

  it("throws NvdRateLimitError when 429 persists beyond retries", async () => {
    const { fetchImpl, calls } = fetchStub([statusResponse(429)]);
    await expect(
      fetchModifiedCves(RANGE, { fetchImpl, sleep: noSleep, retries: 2 }),
    ).rejects.toBeInstanceOf(NvdRateLimitError);
    expect(calls).toHaveLength(3);
  });

  it("retries 5xx responses and succeeds", async () => {
    const { fetchImpl, calls } = fetchStub([statusResponse(503), jsonResponse(emptyFixture)]);
    const result = await fetchModifiedCves(RANGE, { fetchImpl, sleep: noSleep, baseDelayMs: 1 });
    expect(result).toEqual([]);
    expect(calls).toHaveLength(2);
  });

  it("does not retry non-retryable 4xx responses", async () => {
    const { fetchImpl, calls } = fetchStub([statusResponse(404)]);
    await expect(fetchModifiedCves(RANGE, { fetchImpl, sleep: noSleep })).rejects.toBeInstanceOf(
      NvdApiError,
    );
    expect(calls).toHaveLength(1);
  });

  it("rejects when the response body fails schema validation", async () => {
    const { fetchImpl } = fetchStub([jsonResponse({ unexpected: true })]);
    await expect(fetchModifiedCves(RANGE, { fetchImpl, sleep: noSleep })).rejects.toThrow(
      /validation failed/,
    );
  });

  it("sends the API key header when provided", async () => {
    const { fetchImpl, calls } = fetchStub([jsonResponse(emptyFixture)]);
    await fetchModifiedCves(RANGE, { fetchImpl, sleep: noSleep, apiKey: "test-key" });
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.apiKey).toBe("test-key");
  });

  it("aborts a hanging fetch after fetchTimeoutMs and retries", async () => {
    const sleeps: number[] = [];
    const sleep = async (ms: number): Promise<void> => {
      sleeps.push(ms);
    };
    let callCount = 0;
    const fetchImpl = (async (_input: string | URL, init?: RequestInit) => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("This operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      }
      return new Response(JSON.stringify(emptyFixture), { status: 200 });
    }) as typeof fetch;

    const result = await fetchModifiedCves(RANGE, {
      fetchImpl,
      sleep,
      fetchTimeoutMs: 10,
      baseDelayMs: 5,
    });
    expect(result).toEqual([]);
    expect(callCount).toBe(2);
    expect(sleeps.length).toBeGreaterThan(0);
  });

  it("waits between page requests according to the unauthenticated rate limit", async () => {
    const sleeps: number[] = [];
    const sleep = async (ms: number): Promise<void> => {
      sleeps.push(ms);
    };
    const page1 = {
      resultsPerPage: 1,
      startIndex: 0,
      totalResults: 2,
      vulnerabilities: [minimalVuln("CVE-2026-0001")],
    };
    const page2 = {
      resultsPerPage: 1,
      startIndex: 1,
      totalResults: 2,
      vulnerabilities: [minimalVuln("CVE-2026-0002")],
    };
    const { fetchImpl, calls } = fetchStub([jsonResponse(page1), jsonResponse(page2)]);
    // 時刻を固定し、2ページ目の直前にフル間隔の待機が入ることを確認する
    const result = await fetchModifiedCves(RANGE, { fetchImpl, sleep, now: () => 1_000_000 });
    expect(result).toHaveLength(2);
    expect(calls).toHaveLength(2);
    // intervalForRpm(8) = 7500ms（初回リクエストは待機なし）
    expect(sleeps).toEqual([7500]);
  });

  it("uses the higher rate limit when an API key is provided", async () => {
    const sleeps: number[] = [];
    const sleep = async (ms: number): Promise<void> => {
      sleeps.push(ms);
    };
    const page1 = {
      resultsPerPage: 1,
      startIndex: 0,
      totalResults: 2,
      vulnerabilities: [minimalVuln("CVE-2026-0001")],
    };
    const page2 = {
      resultsPerPage: 1,
      startIndex: 1,
      totalResults: 2,
      vulnerabilities: [minimalVuln("CVE-2026-0002")],
    };
    const { fetchImpl } = fetchStub([jsonResponse(page1), jsonResponse(page2)]);
    await fetchModifiedCves(RANGE, {
      fetchImpl,
      sleep,
      apiKey: "test-key",
      now: () => 1_000_000,
    });
    // intervalForRpm(90) = 667ms
    expect(sleeps).toEqual([667]);
  });

  it("applies rate limiting to retry attempts as well", async () => {
    const sleeps: number[] = [];
    const sleep = async (ms: number): Promise<void> => {
      sleeps.push(ms);
    };
    const { fetchImpl, calls } = fetchStub([statusResponse(429), jsonResponse(emptyFixture)]);
    const result = await fetchModifiedCves(RANGE, {
      fetchImpl,
      sleep,
      baseDelayMs: 10,
      now: () => 1_000_000,
    });
    expect(result).toEqual([]);
    expect(calls).toHaveLength(2);
    // バックオフ(10ms)の後、再試行の直前にもレートリミッタが7500ms待機する
    expect(sleeps).toEqual([10, 7500]);
  });

  it("stops early when the collection deadline is exceeded", async () => {
    // ページが尽きない状況で、締切超過により打ち切られることを確認する
    const bogusPage = {
      resultsPerPage: 1,
      startIndex: 0,
      totalResults: 999_999_999,
      vulnerabilities: [minimalVuln("CVE-2026-0001")],
    };
    let t = 1_000_000;
    const { fetchImpl, calls } = fetchStub([
      () => {
        // 1リクエストごとに35万ms経過したことにする（締切60万msなので3ページ目前で超過）
        t += 350_000;
        return new Response(JSON.stringify(bogusPage), { status: 200 });
      },
    ]);
    const result = await fetchModifiedCves(RANGE, {
      fetchImpl,
      sleep: noSleep,
      now: () => t,
      collectionDeadlineMs: 600_000,
    });
    expect(calls).toHaveLength(2);
    expect(result).toHaveLength(2);
  });

  it("throws when fetch times out and all retries are exhausted", async () => {
    const fetchImpl = (async (_input: string | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("This operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }) as typeof fetch;

    await expect(
      fetchModifiedCves(RANGE, {
        fetchImpl,
        sleep: noSleep,
        fetchTimeoutMs: 10,
        retries: 1,
      }),
    ).rejects.toThrow(/aborted/i);
  });
});

describe("fetchCveById", () => {
  it("returns the vulnerability when found", async () => {
    const { fetchImpl, calls } = fetchStub([jsonResponse(sampleFixture)]);
    const result = await fetchCveById("CVE-2026-0001", { fetchImpl, sleep: noSleep });
    expect(result?.cve.id).toBe("CVE-2026-0001");
    expect(calls[0]?.url).toContain("cveId=CVE-2026-0001");
  });

  it("returns null when not found", async () => {
    const { fetchImpl } = fetchStub([jsonResponse(emptyFixture)]);
    const result = await fetchCveById("CVE-2026-9999", { fetchImpl, sleep: noSleep });
    expect(result).toBeNull();
  });
});
