import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CveRecord, IndexData } from "./cveSchema";
import { cveRecordListSchema, indexDataSchema } from "./cveSchema";

export const emptyIndex: IndexData = {
  lastRunAt: "",
  totalCount: 0,
  latestModifiedCursor: "",
  carryover: [],
  years: [],
  lastSuccessfulNvdFetchAt: null,
};

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function readJsonIfExists(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (isNotFound(error)) {
      return undefined;
    }
    throw error;
  }
}

export class FileRepository {
  constructor(private readonly dataDir: string) {}

  private get cveDir(): string {
    return join(this.dataDir, "cve");
  }

  private indexPath(): string {
    return join(this.dataDir, "index.json");
  }

  private yearPath(year: string): string {
    return join(this.cveDir, `${year}.json`);
  }

  async loadIndex(): Promise<IndexData> {
    const raw = await readJsonIfExists(this.indexPath());
    if (raw === undefined) {
      return { ...emptyIndex };
    }
    return indexDataSchema.parse(raw);
  }

  async saveIndex(index: IndexData): Promise<void> {
    indexDataSchema.parse(index);
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.indexPath(), `${JSON.stringify(index, null, 2)}\n`, "utf8");
  }

  async loadYear(year: string): Promise<CveRecord[]> {
    const raw = await readJsonIfExists(this.yearPath(year));
    if (raw === undefined) {
      return [];
    }
    return cveRecordListSchema.parse(raw);
  }

  async saveYear(year: string, records: readonly CveRecord[]): Promise<void> {
    cveRecordListSchema.parse(records);
    await mkdir(this.cveDir, { recursive: true });
    await writeFile(this.yearPath(year), `${JSON.stringify(records, null, 2)}\n`, "utf8");
  }

  async loadAllRecords(years: readonly string[]): Promise<CveRecord[]> {
    const perYear = await Promise.all(years.map((year) => this.loadYear(year)));
    return perYear.flat();
  }
}
