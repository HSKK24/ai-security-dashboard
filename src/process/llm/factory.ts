import type { Settings } from "../../store/cveSchema";
import { GeminiClient } from "./GeminiClient";
import { GitHubModelsClient } from "./GitHubModelsClient";
import type { LLMClient } from "./LLMClient";

export function createLLMClient(
  settings: Settings,
  env: NodeJS.ProcessEnv = process.env,
): LLMClient {
  if (settings.llm.provider === "gemini") {
    return new GeminiClient({ apiKey: env.GEMINI_API_KEY, model: settings.llm.model });
  }
  return new GitHubModelsClient({ token: env.GITHUB_TOKEN, model: settings.llm.model });
}
