import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";

export async function copyAssets(assetsDir: string, distDir: string): Promise<void> {
  const target = join(distDir, "assets");
  await mkdir(target, { recursive: true });
  await cp(assetsDir, target, { recursive: true });
}
