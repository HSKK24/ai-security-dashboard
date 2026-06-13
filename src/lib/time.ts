export function nowIso(): string {
  return new Date().toISOString();
}

export function isoDaysAgo(days: number, from: Date = new Date()): string {
  return new Date(from.getTime() - days * 86_400_000).toISOString();
}

export function yearOf(iso: string): string {
  return iso.slice(0, 4);
}

/**
 * NVDのタイムスタンプはタイムゾーン表記なしのUTCで返るため、
 * 表記がない場合はUTCとして解釈してISO8601へ正規化する。
 */
export function toUtcIso(value: string): string {
  const hasZone = /Z$|[+-]\d{2}:\d{2}$/.test(value);
  const date = new Date(hasZone ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export function maxIso(a: string, b: string): string {
  return a > b ? a : b;
}

export function toJstDisplay(iso: string): string {
  return (
    new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso)) + " JST"
  );
}
