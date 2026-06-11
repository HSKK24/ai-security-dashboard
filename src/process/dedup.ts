import type { CveRecord } from "../store/cveSchema";

function mergeOne(prev: CveRecord, next: CveRecord): CveRecord {
  const contentUnchanged = prev.descriptionEn === next.descriptionEn;
  if (prev.llmStatus === "ok" && contentUnchanged) {
    // 説明文が変わっていなければ既存のLLM要約を使い回し、再要約コストを避ける
    return {
      ...next,
      summaryJa: prev.summaryJa,
      category: prev.category,
      llmStatus: prev.llmStatus,
    };
  }
  return next;
}

export function mergeRecords(
  existing: readonly CveRecord[],
  incoming: readonly CveRecord[],
): CveRecord[] {
  const merged = new Map<string, CveRecord>();
  for (const record of existing) {
    merged.set(record.id, record);
  }
  for (const record of incoming) {
    const prev = merged.get(record.id);
    merged.set(record.id, prev ? mergeOne(prev, record) : record);
  }
  return [...merged.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
