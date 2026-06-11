import { defaultSleep } from "../lib/retry";

export function intervalForRpm(rpm: number): number {
  return Math.ceil(60_000 / rpm);
}

export interface RateLimiterDeps {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class RateLimiter {
  private lastCallAt = 0;

  constructor(
    private readonly minIntervalMs: number,
    private readonly deps: RateLimiterDeps = {},
  ) {}

  async wait(): Promise<void> {
    const now = (this.deps.now ?? Date.now)();
    const remaining = this.minIntervalMs - (now - this.lastCallAt);
    if (remaining > 0) {
      await (this.deps.sleep ?? defaultSleep)(remaining);
    }
    this.lastCallAt = now + Math.max(remaining, 0);
  }
}
