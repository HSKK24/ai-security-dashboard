import { describe, expect, it, vi } from "vitest";
import { backoffDelay, withRetry } from "../../src/lib/retry";

const noSleep = async (): Promise<void> => {};

describe("withRetry", () => {
  it("returns the value on first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries with exponential backoff until success", async () => {
    const sleeps: number[] = [];
    const sleep = async (ms: number): Promise<void> => {
      sleeps.push(ms);
    };
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom1"))
      .mockRejectedValueOnce(new Error("boom2"))
      .mockResolvedValue("ok");
    await expect(withRetry(fn, { sleep, baseDelayMs: 10 })).resolves.toBe("ok");
    expect(sleeps).toEqual([10, 20]);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws the last error when retries are exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(withRetry(fn, { retries: 2, sleep: noSleep })).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry when shouldRetry returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fatal"));
    await expect(withRetry(fn, { shouldRetry: () => false, sleep: noSleep })).rejects.toThrow(
      "fatal",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("invokes onRetry with the attempt number", async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue("ok");
    await withRetry(fn, { sleep: noSleep, onRetry });
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });
});

describe("backoffDelay", () => {
  it("doubles per attempt and caps at the maximum", () => {
    expect(backoffDelay(0, 1000, 30_000)).toBe(1000);
    expect(backoffDelay(1, 1000, 30_000)).toBe(2000);
    expect(backoffDelay(10, 1000, 30_000)).toBe(30_000);
  });
});
