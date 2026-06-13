import { describe, expect, it } from "vitest";
import { isoDaysAgo, maxIso, nowIso, toJstDisplay, toUtcIso, yearOf } from "../../src/lib/time";

describe("toUtcIso", () => {
  it("treats zone-less NVD timestamps as UTC", () => {
    expect(toUtcIso("2026-06-01T10:00:00.000")).toBe("2026-06-01T10:00:00.000Z");
  });

  it("normalizes timestamps that already carry zone info", () => {
    expect(toUtcIso("2026-06-01T10:00:00.000Z")).toBe("2026-06-01T10:00:00.000Z");
    expect(toUtcIso("2026-06-01T19:00:00.000+09:00")).toBe("2026-06-01T10:00:00.000Z");
  });

  it("returns unparsable input unchanged", () => {
    expect(toUtcIso("not-a-date")).toBe("not-a-date");
  });
});

describe("yearOf", () => {
  it("extracts the year prefix from an ISO string", () => {
    expect(yearOf("2026-06-01T10:00:00.000Z")).toBe("2026");
  });
});

describe("maxIso", () => {
  it("returns the lexicographically later ISO timestamp", () => {
    expect(maxIso("2026-01-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z")).toBe(
      "2026-06-01T00:00:00.000Z",
    );
    expect(maxIso("2026-06-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z")).toBe(
      "2026-06-01T00:00:00.000Z",
    );
  });
});

describe("isoDaysAgo", () => {
  it("subtracts whole days from the reference date", () => {
    const from = new Date("2026-06-10T00:00:00.000Z");
    expect(isoDaysAgo(7, from)).toBe("2026-06-03T00:00:00.000Z");
  });
});

describe("nowIso", () => {
  it("returns a valid ISO8601 timestamp", () => {
    const value = nowIso();
    expect(new Date(value).toISOString()).toBe(value);
  });
});

describe("toJstDisplay", () => {
  it("converts UTC timestamp to JST display string", () => {
    // 2026-06-12T23:07:00.000Z = 2026-06-13 08:07 JST (+9h)
    expect(toJstDisplay("2026-06-12T23:07:00.000Z")).toBe("2026/06/13 08:07 JST");
  });
});
