import type { NvdVulnerability } from "./nvdSchema";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 短い大文字略語（LLM, GPT等）は単語境界で完全一致させ、
 * "ChatGPT" のような別キーワードへの誤マッチを防ぐ。
 */
export function buildKeywordMatchers(keywords: readonly string[]): RegExp[] {
  return keywords.map((keyword) => {
    const escaped = escapeRegExp(keyword);
    const isShortAcronym = keyword.length <= 4 && keyword === keyword.toUpperCase();
    return isShortAcronym ? new RegExp(`\\b${escaped}\\b`) : new RegExp(escaped, "i");
  });
}

export function matchesKeywords(text: string, keywords: readonly string[]): boolean {
  return buildKeywordMatchers(keywords).some((matcher) => matcher.test(text));
}

export function englishDescription(vuln: NvdVulnerability): string {
  return vuln.cve.descriptions.find((d) => d.lang === "en")?.value ?? "";
}

export function filterByKeywords(
  vulns: readonly NvdVulnerability[],
  keywords: readonly string[],
): NvdVulnerability[] {
  const matchers = buildKeywordMatchers(keywords);
  return vulns.filter((vuln) => {
    const text = englishDescription(vuln);
    return matchers.some((matcher) => matcher.test(text));
  });
}
