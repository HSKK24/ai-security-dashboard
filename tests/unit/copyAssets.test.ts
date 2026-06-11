import { access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { copyAssets } from "../../src/build/copyAssets";

const assetsDir = fileURLToPath(new URL("../../assets", import.meta.url));

describe("copyAssets", () => {
  it("copies all asset files into dist/assets", async () => {
    const distDir = await mkdtemp(join(tmpdir(), "aisec-assets-"));
    await copyAssets(assetsDir, distDir);
    await expect(access(join(distDir, "assets", "styles.css"))).resolves.toBeUndefined();
    await expect(access(join(distDir, "assets", "filter.js"))).resolves.toBeUndefined();
    await expect(access(join(distDir, "assets", "charts.js"))).resolves.toBeUndefined();
  });
});
