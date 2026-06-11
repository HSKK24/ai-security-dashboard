import { z } from "zod";
import type { LLMClient, LLMRequest, LLMResult } from "./LLMClient";
import { classifyLlmError, withTimeout } from "./LLMClient";

const GITHUB_MODELS_URL = "https://models.github.ai/inference/chat/completions";

const responseBodySchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string(),
        }),
      }),
    )
    .min(1),
});

export interface GitHubModelsClientOptions {
  model: string;
  token?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class GitHubModelsClient implements LLMClient {
  private readonly token: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GitHubModelsClientOptions) {
    if (!options.token) {
      throw new Error("GITHUB_TOKEN is not set");
    }
    this.token = options.token;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async complete(req: LLMRequest): Promise<LLMResult> {
    try {
      const response = await withTimeout(this.request(req), this.timeoutMs);
      if (response.status === 429) {
        return { ok: false, json: null, error: "rate_limit" };
      }
      if (!response.ok) {
        return { ok: false, json: null, error: "unknown" };
      }
      const body = responseBodySchema.safeParse(await response.json());
      if (!body.success) {
        return { ok: false, json: null, error: "invalid" };
      }
      const content = body.data.choices[0]?.message.content ?? "";
      return { ok: true, json: JSON.parse(content) };
    } catch (error) {
      return { ok: false, json: null, error: classifyLlmError(error) };
    }
  }

  private request(req: LLMRequest): Promise<Response> {
    return this.fetchImpl(GITHUB_MODELS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: req.systemPrompt },
          { role: "user", content: req.userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "cve_summary",
            schema: req.responseSchema,
            strict: true,
          },
        },
      }),
    });
  }
}
