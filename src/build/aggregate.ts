import type { CveRecord, RunStats } from "../store/cveSchema";
import { categorySchema, severitySchema } from "../store/cveSchema";

export type { RunStats } from "../store/cveSchema";

export const UNKNOWN_SEVERITY = "UNKNOWN";
export const UNCLASSIFIED_CATEGORY = "unclassified";

export interface DashboardStats {
  generatedAt: string;
  displayDays: number;
  totalCount: number;
  severityCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
  recent: CveRecord[];
  lastRunAt: string;
  lastRunStats: RunStats | null;
}

function countBy<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  baseKeys: readonly string[],
): Record<string, number> {
  const base: Record<string, number> = Object.fromEntries(baseKeys.map((key) => [key, 0]));
  return items.reduce((acc, item) => {
    const key = keyOf(item);
    return { ...acc, [key]: (acc[key] ?? 0) + 1 };
  }, base);
}

export function aggregate(
  records: readonly CveRecord[],
  options: {
    displayDays: number;
    generatedAt: string;
    now: string;
    lastRunAt: string;
    lastRunStats?: RunStats;
  },
): DashboardStats {
  const severityCounts = countBy(records, (record) => record.severity ?? UNKNOWN_SEVERITY, [
    ...severitySchema.options,
    UNKNOWN_SEVERITY,
  ]);
  const categoryCounts = countBy(records, (record) => record.category ?? UNCLASSIFIED_CATEGORY, [
    ...categorySchema.options,
    UNCLASSIFIED_CATEGORY,
  ]);
  const cutoffMs = new Date(options.now).getTime() - options.displayDays * 24 * 60 * 60 * 1000;
  const cutoff = new Date(cutoffMs).toISOString().slice(0, 10);
  const recent = [...records]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .filter((r) => r.publishedAt.slice(0, 10) >= cutoff);

  return {
    generatedAt: options.generatedAt,
    displayDays: options.displayDays,
    totalCount: records.length,
    severityCounts,
    categoryCounts,
    recent,
    lastRunAt: options.lastRunAt,
    lastRunStats: options.lastRunStats ?? null,
  };
}
