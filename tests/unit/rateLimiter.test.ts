import { describe, expect, it } from "vitest";
import { RateLimiter, intervalForRpm } from "../../src/collect/rateLimiter";

describe("intervalForRpm", () => {
  it("converts requests-per-minute to a millisecond interval", () => {
    expect(intervalForRpm(10)).toBe(6000);
    expect(intervalForRpm(60)).toBe(1000);
  });
});

describe("RateLimiter", () => {
  it("does not sleep when enough time has already passed", async () => {
    const sleeps: number[] = [];
    const limiter = new RateLimiter(500, {
      now: () => 10_000,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await limiter.wait();
    expect(sleeps).toEqual([]);
  });

  it("sleeps for the remaining interval between consecutive calls", async () => {
    const nowValues = [1000, 1200];
    let call = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter(500, {
      now: () => nowValues[Math.min(call++, nowValues.length - 1)] ?? 0,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await limiter.wait();
    await limiter.wait();
    expect(sleeps).toEqual([300]);
  });
});
