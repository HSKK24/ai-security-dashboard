import { englishDescription } from "../collect/keywordFilter";
import type { NvdVulnerability } from "../collect/nvdSchema";
import { toUtcIso } from "../lib/time";
import type { CveRecord, Severity } from "../store/cveSchema";
import { severitySchema } from "../store/cveSchema";

const NVD_DETAIL_BASE = "https://nvd.nist.gov/vuln/detail/";

interface CvssInfo {
  score: number | null;
  severity: Severity | null;
}

function parseSeverity(raw: string | undefined): Severity | null {
  const parsed = severitySchema.safeParse(raw?.toUpperCase());
  return parsed.success ? parsed.data : null;
}

function extractCvss(vuln: NvdVulnerability): CvssInfo {
  const metrics = vuln.cve.metrics;
  const v3 = metrics?.cvssMetricV31?.[0] ?? metrics?.cvssMetricV30?.[0];
  if (v3) {
    return { score: v3.cvssData.baseScore, severity: parseSeverity(v3.cvssData.baseSeverity) };
  }
  const v2 = metrics?.cvssMetricV2?.[0];
  if (v2) {
    return { score: v2.cvssData.baseScore, severity: parseSeverity(v2.baseSeverity) };
  }
  return { score: null, severity: null };
}

export function normalizeVulnerability(vuln: NvdVulnerability, fetchedAt: string): CveRecord {
  const { score, severity } = extractCvss(vuln);
  return {
    id: vuln.cve.id,
    sourceUrl: `${NVD_DETAIL_BASE}${vuln.cve.id}`,
    descriptionEn: englishDescription(vuln),
    summaryJa: null,
    category: null,
    cvssScore: score,
    severity,
    publishedAt: toUtcIso(vuln.cve.published),
    lastModifiedAt: toUtcIso(vuln.cve.lastModified),
    fetchedAt,
    llmStatus: "pending",
  };
}

export function normalizeAll(vulns: readonly NvdVulnerability[], fetchedAt: string): CveRecord[] {
  return vulns.map((vuln) => normalizeVulnerability(vuln, fetchedAt));
}
