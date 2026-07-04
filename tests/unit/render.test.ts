import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DashboardStats } from "../../src/build/aggregate";
import { aggregate } from "../../src/build/aggregate";
import { createRenderer, renderPage, renderSite } from "../../src/build/render";
import { makeRecord } from "../helpers/factories";

const templatesDir = fileURLToPath(new URL("../../templates", import.meta.url));

function makeStats(overrides: { nvdFetchFailed?: boolean } = {}): DashboardStats {
  return aggregate(
    [
      makeRecord({
        id: "CVE-2026-0001",
        summaryJa: "LLMアプリのプロンプトインジェクション脆弱性。",
        category: "prompt-injection",
        llmStatus: "ok",
      }),
      makeRecord({
        id: "CVE-2026-0002",
        descriptionEn: '<script>alert("xss")</script> in description',
        summaryJa: null,
        llmStatus: "failed",
        publishedAt: "2026-06-02T00:00:00.000Z",
      }),
    ],
    {
      displayDays: 90,
      generatedAt: "2026-06-10T22:00:00.000Z",
      now: "2026-06-10T22:00:00.000Z",
      lastRunAt: "2026-06-10 07:00 JST",
      lastRunStats: {
        nvdFetched: 892,
        keywordMatched: 3,
        llmEnriched: 3,
        nvdFetchFailed: overrides.nvdFetchFailed ?? false,
      },
      lastSuccessfulNvdFetchAt: "2026-06-09 07:00 JST",
    },
  );
}

describe("renderPage", () => {
  it("renders the index page with CVE rows and summary cards", () => {
    const eta = createRenderer(templatesDir);
    const html = renderPage(eta, "index", { stats: makeStats() });
    expect(html).toContain("CVE-2026-0001");
    expect(html).toContain("LLMアプリのプロンプトインジェクション脆弱性。");
    expect(html).toContain("総CVE件数");
  });

  it("escapes HTML in CVE descriptions (XSS protection)", () => {
    const eta = createRenderer(templatesDir);
    const html = renderPage(eta, "index", { stats: makeStats() });
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain("&lt;script&gt;");
  });

  it("falls back to the english description when no summary exists", () => {
    const eta = createRenderer(templatesDir);
    const html = renderPage(eta, "index", { stats: makeStats() });
    expect(html).toContain("日本語要約は準備中");
  });

  it("renders the pipeline run summary in the footer", () => {
    const eta = createRenderer(templatesDir);
    const html = renderPage(eta, "index", { stats: makeStats() });
    expect(html).toContain("パイプライン最終実行: 2026-06-10 07:00 JST");
    expect(html).toContain("NVD 892件スキャン");
    expect(html).toContain("マッチ 3件");
    expect(html).toContain("LLM処理 3件");
    expect(html).not.toContain("NVD取得失敗");
  });

  it("renders a fetch-failure notice with the last successful scan time", () => {
    const eta = createRenderer(templatesDir);
    const html = renderPage(eta, "index", { stats: makeStats({ nvdFetchFailed: true }) });
    expect(html).toContain("NVD取得失敗");
    expect(html).toContain("最終成功スキャン: 2026-06-09 07:00 JST");
    expect(html).not.toContain("NVD 892件スキャン");
  });

  it("renders the about page with the total count", () => {
    const eta = createRenderer(templatesDir);
    const html = renderPage(eta, "about", { stats: makeStats() });
    expect(html).toContain("このサイトについて");
    expect(html).toContain("2");
  });
});

describe("renderSite", () => {
  it("writes index.html and about.html into the dist directory", async () => {
    const distDir = await mkdtemp(join(tmpdir(), "aisec-dist-"));
    await renderSite({ templatesDir, distDir, stats: makeStats() });
    const index = await readFile(join(distDir, "index.html"), "utf8");
    const about = await readFile(join(distDir, "about.html"), "utf8");
    expect(index).toContain("CVE-2026-0001");
    expect(about).toContain("このサイトについて");
  });
});
