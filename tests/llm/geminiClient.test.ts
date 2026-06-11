import { describe, expect, it } from "vitest";
import { GeminiClient, toGeminiSchema } from "../../src/process/llm/GeminiClient";
import type { LLMRequest } from "../../src/process/llm/LLMClient";

const REQUEST: LLMRequest = {
  systemPrompt: "system",
  userPrompt: "user",
  responseSchema: { type: "object" },
};

describe("GeminiClient", () => {
  it("parses a JSON text response", async () => {
    const client = new GeminiClient({
      model: "test",
      generate: async () => '{"summaryJa":"要約","category":"other"}',
    });
    const result = await client.complete(REQUEST);
    expect(result.ok).toBe(true);
    expect(result.json).toEqual({ summaryJa: "要約", category: "other" });
  });

  it("returns invalid when the response is not JSON", async () => {
    const client = new GeminiClient({ model: "test", generate: async () => "not json at all" });
    const result = await client.complete(REQUEST);
    expect(result).toEqual({ ok: false, json: null, error: "invalid" });
  });

  it("returns invalid when the response text is missing", async () => {
    const client = new GeminiClient({ model: "test", generate: async () => undefined });
    const result = await client.complete(REQUEST);
    expect(result).toEqual({ ok: false, json: null, error: "invalid" });
  });

  it("classifies quota errors as rate_limit", async () => {
    const client = new GeminiClient({
      model: "test",
      generate: async () => {
        throw new Error("429 RESOURCE_EXHAUSTED: quota exceeded");
      },
    });
    const result = await client.complete(REQUEST);
    expect(result.error).toBe("rate_limit");
  });

  it("classifies unknown failures as unknown", async () => {
    const client = new GeminiClient({
      model: "test",
      generate: async () => {
        throw new Error("something else entirely");
      },
    });
    const result = await client.complete(REQUEST);
    expect(result.error).toBe("unknown");
  });

  it("times out when the API call never resolves", async () => {
    const client = new GeminiClient({
      model: "test",
      timeoutMs: 10,
      generate: () => new Promise<string>(() => {}),
    });
    const result = await client.complete(REQUEST);
    expect(result).toEqual({ ok: false, json: null, error: "timeout" });
  });

  it("requires an API key when no generate hook is injected", () => {
    expect(() => new GeminiClient({ model: "test" })).toThrow(/GEMINI_API_KEY/);
  });
});

describe("toGeminiSchema", () => {
  it("uppercases type fields recursively", () => {
    const input = {
      type: "object",
      properties: {
        summaryJa: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["summaryJa"],
    };
    expect(toGeminiSchema(input)).toEqual({
      type: "OBJECT",
      properties: {
        summaryJa: { type: "STRING" },
        tags: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["summaryJa"],
    });
  });

  it("passes through primitives unchanged", () => {
    expect(toGeminiSchema("text")).toBe("text");
    expect(toGeminiSchema(42)).toBe(42);
    expect(toGeminiSchema(null)).toBeNull();
  });
});
