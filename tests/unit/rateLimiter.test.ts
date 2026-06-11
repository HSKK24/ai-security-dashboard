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
    // wait() は開始時と sleep 後の2回 now() を呼ぶ
    const nowValues = [1000, 1000, 1200, 1500];
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

  it("uses the actual post-sleep time as the base for the next interval", async () => {
    // sleep が要求(500ms)より長く実時間が経過した場合（600ms）でも、
    // 次の間隔計算が sleep 後の実際の時刻を基準にすることを確認する
    const nowValues = [0, 600, 900, 1100];
    let call = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter(500, {
      now: () => nowValues[Math.min(call++, nowValues.length - 1)] ?? 0,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await limiter.wait(); // now=0, sleep(500), 実際は600まで経過 → lastCallAt=600
    await limiter.wait(); // now=900, remaining=500-(900-600)=200 → sleep(200)
    expect(sleeps).toEqual([500, 200]);
  });
});
