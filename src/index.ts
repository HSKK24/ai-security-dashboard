import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyAssets } from "./build/copyAssets";
import { aggregate } from "./build/aggregate";
import { renderSite } from "./build/render";
import { filterByKeywords } from "./collect/keywordFilter";
import { fetchModifiedCves } from "./collect/nvdClient";
import { logger } from "./lib/logger";
import { isoDaysAgo, maxIso, nowIso, toJstDisplay, yearOf } from "./lib/time";
import { mergeRecords } from "./process/dedup";
import { enrichRecords } from "./process/enrich";
import { createLLMClient } from "./process/llm/factory";
import { normalizeAll } from "./process/normalize";
import type { CveRecord, IndexData, Settings } from "./store/cveSchema";
import { settingsSchema } from "./store/cveSchema";
import { FileRepository } from "./store/repository";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const INITIAL_LOOKBACK_DAYS = 14;

async function loadSettings(): Promise<Settings> {
  const raw: unknown = JSON.parse(await readFile(join(rootDir, "config", "settings.json"), "utf8"));
  return settingsSchema.parse(raw);
}

interface CollectOutcome {
  records: CveRecord[];
  nvdFetched: number;
  keywordMatched: number;
}

async function collectNewRecords(
  settings: Settings,
  index: IndexData,
  fetchedAt: string,
): Promise<CollectOutcome> {
  const since = index.latestModifiedCursor || isoDaysAgo(INITIAL_LOOKBACK_DAYS);
  const until = nowIso();
  try {
    const vulns = await fetchModifiedCves({ since, until }, { apiKey: process.env.NVD_API_KEY });
    const matched = filterByKeywords(vulns, settings.keywords);
    logger.info(`NVD: fetched ${vulns.length} modified CVEs, ${matched.length} matched keywords`);
    return {
      records: normalizeAll(matched, fetchedAt),
      nvdFetched: vulns.length,
      keywordMatched: matched.length,
    };
  } catch (error) {
    // NVD側の障害時は新規取得を諦め、前回データのみでサイトを更新し続ける
    const reason = error instanceof Error ? error.message : String(error);
    logger.error(`NVD collection failed; continuing with existing data: ${reason}`);
    return { records: [], nvdFetched: 0, keywordMatched: 0 };
  }
}

async function saveByYear(repo: FileRepository, records: readonly CveRecord[]): Promise<string[]> {
  const years = [...new Set(records.map((record) => yearOf(record.publishedAt)))].sort().reverse();
  for (const year of years) {
    await repo.saveYear(
      year,
      records.filter((record) => yearOf(record.publishedAt) === year),
    );
  }
  return years;
}

async function runPipeline(): Promise<void> {
  const settings = await loadSettings();
  const repo = new FileRepository(join(rootDir, "data"));
  const index = await repo.loadIndex();
  const fetchedAt = nowIso();

  const {
    records: incoming,
    nvdFetched,
    keywordMatched,
  } = await collectNewRecords(settings, index, fetchedAt);
  const existing = await repo.loadAllRecords(index.years);
  const merged = mergeRecords(existing, incoming);

  // Carryover records (deferred from the previous run) are processed first
  // to prevent starvation when daily inflow saturates maxItems.
  const carryoverIds = new Set(index.carryover);
  const needsEnrich = (r: CveRecord) => r.llmStatus === "pending" || r.llmStatus === "failed";
  const prioritized = [
    ...merged.filter((r) => carryoverIds.has(r.id) && needsEnrich(r)),
    ...merged.filter((r) => !(carryoverIds.has(r.id) && needsEnrich(r))),
  ];

  const client = createLLMClient(settings);
  const { records, carryover } = await enrichRecords(prioritized, client, {
    rpmLimit: settings.llm.rpmLimit,
    maxItems: settings.maxItems,
  });

  // 今回マッチした新規CVEのうち、要約に成功した件数
  const incomingIds = new Set(incoming.map((r) => r.id));
  const llmEnriched = records.filter((r) => r.llmStatus === "ok" && incomingIds.has(r.id)).length;

  const years = await saveByYear(repo, records);
  // Advance cursor only over enriched records so pending carryover items can be
  // re-fetched from NVD if year files are ever pruned.
  const enrichedRecords = records.filter((r) => r.llmStatus !== "pending");
  const cursor = enrichedRecords.reduce(
    (max, record) => maxIso(max, record.lastModifiedAt),
    index.latestModifiedCursor,
  );
  await repo.saveIndex({
    lastRunAt: nowIso(),
    totalCount: records.length,
    latestModifiedCursor: cursor,
    carryover,
    years,
    lastRunStats: { nvdFetched, keywordMatched, llmEnriched },
  });
  logger.info(`pipeline completed: total=${records.length} carryover=${carryover.length}`);
}

async function runBuild(): Promise<void> {
  const settings = await loadSettings();
  const repo = new FileRepository(join(rootDir, "data"));
  const index = await repo.loadIndex();
  const records = await repo.loadAllRecords(index.years);
  const now = nowIso();
  const stats = aggregate(records, {
    displayDays: settings.displayDays,
    generatedAt: toJstDisplay(now),
    now,
    lastRunAt: index.lastRunAt ? toJstDisplay(index.lastRunAt) : "未実行",
    lastRunStats: index.lastRunStats,
  });
  const distDir = join(rootDir, "dist");
  await renderSite({ templatesDir: join(rootDir, "templates"), distDir, stats });
  await copyAssets(join(rootDir, "assets"), distDir);
  logger.info(`build completed: ${stats.totalCount} records rendered`);
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode === "pipeline") {
    await runPipeline();
    return;
  }
  if (mode === "build") {
    await runBuild();
    return;
  }
  logger.error(`unknown mode: ${mode ?? "(none)"} (expected "pipeline" or "build")`);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  const reason = error instanceof Error ? (error.stack ?? error.message) : String(error);
  logger.error(`fatal: ${reason}`);
  process.exitCode = 1;
});
