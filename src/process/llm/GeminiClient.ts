import { GoogleGenAI } from "@google/genai";
import type { LLMClient, LLMRequest, LLMResult } from "./LLMClient";
import { classifyLlmError, withTimeout } from "./LLMClient";

export type GenerateFn = (req: LLMRequest) => Promise<string | undefined>;

export interface GeminiClientOptions {
  model: string;
  apiKey?: string;
  timeoutMs?: number;
  /** テスト用に実APIコールを差し替えるためのフック */
  generate?: GenerateFn;
}

/** JSON Schemaの"type"をGemini SDKが要求する大文字表記へ変換する */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map(toGeminiSchema);
  }
  if (schema !== null && typeof schema === "object") {
    return Object.fromEntries(
      Object.entries(schema as Record<string, unknown>).map(([key, value]) =>
        key === "type" && typeof value === "string"
          ? [key, value.toUpperCase()]
          : [key, toGeminiSchema(value)],
      ),
    );
  }
  return schema;
}

function createGenerate(options: GeminiClientOptions): GenerateFn {
  const apiKey = options.apiKey;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  const ai = new GoogleGenAI({ apiKey });
  return async (req) => {
    const response = await ai.models.generateContent({
      model: options.model,
      contents: req.userPrompt,
      config: {
        systemInstruction: req.systemPrompt,
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(req.responseSchema) as Record<string, unknown>,
      },
    });
    return response.text;
  };
}

export class GeminiClient implements LLMClient {
  private readonly generate: GenerateFn;
  private readonly timeoutMs: number;

  constructor(options: GeminiClientOptions) {
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.generate = options.generate ?? createGenerate(options);
  }

  async complete(req: LLMRequest): Promise<LLMResult> {
    try {
      const text = await withTimeout(this.generate(req), this.timeoutMs);
      if (typeof text !== "string" || text.length === 0) {
        return { ok: false, json: null, error: "invalid" };
      }
      return { ok: true, json: JSON.parse(text) };
    } catch (error) {
      return { ok: false, json: null, error: classifyLlmError(error) };
    }
  }
}
