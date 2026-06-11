import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { FileRepository, emptyIndex } from "../../src/store/repository";
import { makeRecord } from "../helpers/factories";

describe("FileRepository", () => {
  let dataDir: string;
  let repo: FileRepository;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "aisec-repo-"));
    repo = new FileRepository(dataDir);
  });

  it("returns the empty index when index.json does not exist", async () => {
    await expect(repo.loadIndex()).resolves.toEqual(emptyIndex);
  });

  it("round-trips the index file", async () => {
    const index = {
      lastRunAt: "2026-06-10T22:00:00.000Z",
      totalCount: 2,
      latestModifiedCursor: "2026-06-07T11:30:00.000Z",
      carryover: ["CVE-2026-0002"],
      years: ["2026"],
    };
    await repo.saveIndex(index);
    await expect(repo.loadIndex()).resolves.toEqual(index);
  });

  it("rejects saving an invalid index", async () => {
    const invalid = { ...emptyIndex, totalCount: -5 };
    await expect(repo.saveIndex(invalid)).rejects.toThrow();
  });

  it("returns an empty list for a missing year file", async () => {
    await expect(repo.loadYear("2026")).resolves.toEqual([]);
  });

  it("round-trips year files and loads all records", async () => {
    const r2026 = makeRecord({ id: "CVE-2026-0001", publishedAt: "2026-06-01T00:00:00.000Z" });
    const r2025 = makeRecord({ id: "CVE-2025-0001", publishedAt: "2025-03-01T00:00:00.000Z" });
    await repo.saveYear("2026", [r2026]);
    await repo.saveYear("2025", [r2025]);
    await expect(repo.loadYear("2026")).resolves.toEqual([r2026]);
    const all = await repo.loadAllRecords(["2026", "2025"]);
    expect(all.map((r) => r.id).sort()).toEqual(["CVE-2025-0001", "CVE-2026-0001"]);
  });

  it("rejects loading a year file with invalid records", async () => {
    await writeFile(join(dataDir, "index.json"), "{}", "utf8");
    await expect(repo.loadIndex()).rejects.toThrow();
  });
});
