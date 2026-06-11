import { describe, expect, it } from "vitest";
import { GeminiClient } from "../../src/process/llm/GeminiClient";
import { GitHubModelsClient } from "../../src/process/llm/GitHubModelsClient";
import { createLLMClient } from "../../src/process/llm/factory";
import type { Settings } from "../../src/store/cveSchema";

function makeSettings(provider: "gemini" | "github"): Settings {
  return {
    keywords: ["LLM"],
    maxItems: 30,
    displayItems: 60,
    llm: { provider, model: "test-model", rpmLimit: 10 },
  };
}

describe("createLLMClient", () => {
  it("creates a GeminiClient for the gemini provider", () => {
    const client = createLLMClient(makeSettings("gemini"), { GEMINI_API_KEY: "key" });
    expect(client).toBeInstanceOf(GeminiClient);
  });

  it("throws for the gemini provider when GEMINI_API_KEY is missing", () => {
    expect(() => createLLMClient(makeSettings("gemini"), {})).toThrow(/GEMINI_API_KEY/);
  });

  it("creates a GitHubModelsClient for the github provider", () => {
    const client = createLLMClient(makeSettings("github"), { GITHUB_TOKEN: "token" });
    expect(client).toBeInstanceOf(GitHubModelsClient);
  });

  it("throws for the github provider when GITHUB_TOKEN is missing", () => {
    expect(() => createLLMClient(makeSettings("github"), {})).toThrow(/GITHUB_TOKEN/);
  });
});
