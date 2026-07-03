import type { CveRecord } from "../store/cveSchema";

function needsEnrich(record: CveRecord): boolean {
  return record.llmStatus === "pending" || record.llmStatus === "failed";
}

// 前回持ち越し（carryover）かつ未エンリッチのレコードを先頭に集める。
// 日次流入がmaxItemsを飽和させたとき持ち越し分が永遠に処理されない（starvation）のを防ぐ。
// それ以外は元の順序を維持する安定な並び替え。
export function prioritizeCarryover(
  records: readonly CveRecord[],
  carryoverIds: ReadonlySet<string>,
): CveRecord[] {
  const isPriority = (r: CveRecord) => carryoverIds.has(r.id) && needsEnrich(r);
  return [...records.filter(isPriority), ...records.filter((r) => !isPriority(r))];
}
