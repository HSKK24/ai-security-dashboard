export interface LLMRequest {
  systemPrompt: string;
  userPrompt: string;
  responseSchema: object;
}

export interface LLMResult {
  ok: boolean;
  json: unknown | null;
  error?: "rate_limit" | "timeout" | "invalid" | "unknown";
}

export interface LLMClient {
  complete(req: LLMRequest): Promise<LLMResult>;
}

export type LLMErrorKind = NonNullable<LLMResult["error"]>;

export class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`LLM call timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(timeoutMs)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export function classifyLlmError(error: unknown): LLMErrorKind {
  if (error instanceof TimeoutError) {
    return "timeout";
  }
  if (error instanceof SyntaxError) {
    return "invalid";
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/429|RESOURCE_EXHAUSTED|rate limit|quota/i.test(message)) {
    return "rate_limit";
  }
  if (/timeout|timed out|aborted/i.test(message)) {
    return "timeout";
  }
  return "unknown";
}
