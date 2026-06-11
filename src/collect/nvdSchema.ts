import { z } from "zod";

const descriptionSchema = z.object({
  lang: z.string(),
  value: z.string(),
});

const cvssV3MetricSchema = z.object({
  cvssData: z.object({
    baseScore: z.number(),
    baseSeverity: z.string(),
  }),
});

const cvssV2MetricSchema = z.object({
  cvssData: z.object({
    baseScore: z.number(),
  }),
  baseSeverity: z.string().optional(),
});

export const nvdCveSchema = z.object({
  id: z.string(),
  published: z.string(),
  lastModified: z.string(),
  descriptions: z.array(descriptionSchema),
  metrics: z
    .object({
      cvssMetricV31: z.array(cvssV3MetricSchema).optional(),
      cvssMetricV30: z.array(cvssV3MetricSchema).optional(),
      cvssMetricV2: z.array(cvssV2MetricSchema).optional(),
    })
    .optional(),
});

export const nvdVulnerabilitySchema = z.object({
  cve: nvdCveSchema,
});

export const nvdResponseSchema = z.object({
  resultsPerPage: z.number(),
  startIndex: z.number(),
  totalResults: z.number(),
  vulnerabilities: z.array(nvdVulnerabilitySchema),
});

export type NvdCve = z.infer<typeof nvdCveSchema>;
export type NvdVulnerability = z.infer<typeof nvdVulnerabilitySchema>;
export type NvdResponse = z.infer<typeof nvdResponseSchema>;
