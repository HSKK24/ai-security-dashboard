import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Eta } from "eta";
import type { DashboardStats } from "./aggregate";

export function createRenderer(templatesDir: string): Eta {
  // autoEscapeはEtaのデフォルトで有効（XSS対策）。明示しておく。
  return new Eta({ views: templatesDir, autoEscape: true });
}

export function renderPage(eta: Eta, template: string, data: { stats: DashboardStats }): string {
  return eta.render(template, data);
}

export async function renderSite(options: {
  templatesDir: string;
  distDir: string;
  stats: DashboardStats;
}): Promise<void> {
  const eta = createRenderer(options.templatesDir);
  await mkdir(options.distDir, { recursive: true });

  const pages = [
    ["index", "index.html"],
    ["about", "about.html"],
  ] as const;

  await Promise.all(
    pages.map(async ([template, fileName]) => {
      const html = renderPage(eta, template, { stats: options.stats });
      await writeFile(join(options.distDir, fileName), html, "utf8");
    }),
  );
}
