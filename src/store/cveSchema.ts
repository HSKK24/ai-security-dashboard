import { z } from "zod";

export const categorySchema = z.enum([
  "prompt-injection",
  "model-vuln",
  "ai-library",
  "ai-service",
  "other",
]);

export const severitySchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"]);

export const llmStatusSchema = z.enum(["ok", "failed", "pending"]);

export const cveRecordSchema = z.object({
  id: z.string().regex(/^CVE-\d{4}-\d{4,}$/),
  sourceUrl: z.string().url().refine((u) => new URL(u).protocol === "https:"),
  descriptionEn: z.string(),
  summaryJa: z.string().min(1).max(2000).nullable(),
  category: categorySchema.nullable(),
  cvssScore: z.number().min(0).max(10).nullable(),
  severity: severitySchema.nullable(),
  publishedAt: z.string(),
  lastModifiedAt: z.string(),
  fetchedAt: z.string(),
  llmStatus: llmStatusSchema,
});

export const cveRecordListSchema = z.array(cveRecordSchema);

export const indexDataSchema = z.object({
  lastRunAt: z.string(),
  totalCount: z.number().int().min(0),
  latestModifiedCursor: z.string(),
  carryover: z.array(z.string()),
  years: z.array(z.string().regex(/^\d{4}$/)),
});

export const settingsSchema = z.object({
  keywords: z.array(z.string().min(1)).min(1),
  maxItems: z.number().int().positive(),
  displayDays: z.number().int().positive(),
  llm: z.object({
    provider: z.enum(["gemini", "github"]),
    model: z.string().min(1),
    rpmLimit: z.number().int().positive(),
  }),
});

export type Category = z.infer<typeof categorySchema>;
export type Severity = z.infer<typeof severitySchema>;
export type LlmStatus = z.infer<typeof llmStatusSchema>;
export type CveRecord = z.infer<typeof cveRecordSchema>;
export type IndexData = z.infer<typeof indexDataSchema>;
export type Settings = z.infer<typeof settingsSchema>;
