import { describe, expect, it } from "vitest";
import { GitHubModelsClient } from "../../src/process/llm/GitHubModelsClient";
import type { LLMRequest } from "../../src/process/llm/LLMClient";

const REQUEST: LLMRequest = {
  systemPrompt: "system",
  userPrompt: "user",
  responseSchema: { type: "object" },
};

function chatResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

function clientWith(response: Response | (() => Response)): {
  client: GitHubModelsClient;
  requests: { url: string; init?: RequestInit }[];
} {
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return typeof response === "function" ? response() : response;
  }) as typeof fetch;
  const client = new GitHubModelsClient({ model: "openai/gpt-4o-mini", token: "t", fetchImpl });
  return { client, requests };
}

describe("GitHubModelsClient", () => {
  it("throws when no token is provided", () => {
    expect(() => new GitHubModelsClient({ model: "m" })).toThrow(/GITHUB_TOKEN/);
  });

  it("parses the JSON content of a successful completion", async () => {
    const { client } = clientWith(chatResponse('{"summaryJa":"要約","category":"other"}'));
    const result = await client.complete(REQUEST);
    expect(result.ok).toBe(true);
    expect(result.json).toEqual({ summaryJa: "要約", category: "other" });
  });

  it("sends model, messages, and a strict json_schema response_format", async () => {
    const { client, requests } = clientWith(chatResponse("{}"));
    await client.complete(REQUEST);
    const body = JSON.parse(String(requests[0]?.init?.body));
    expect(body.model).toBe("openai/gpt-4o-mini");
    expect(body.messages).toHaveLength(2);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
  });

  it("returns rate_limit on HTTP 429", async () => {
    const { client } = clientWith(new Response("", { status: 429 }));
    const result = await client.complete(REQUEST);
    expect(result).toEqual({ ok: false, json: null, error: "rate_limit" });
  });

  it("returns unknown on other HTTP errors", async () => {
    const { client } = clientWith(new Response("", { status: 500 }));
    const result = await client.complete(REQUEST);
    expect(result).toEqual({ ok: false, json: null, error: "unknown" });
  });

  it("returns invalid when the body shape is unexpected", async () => {
    const { client } = clientWith(new Response(JSON.stringify({ nope: true }), { status: 200 }));
    const result = await client.complete(REQUEST);
    expect(result).toEqual({ ok: false, json: null, error: "invalid" });
  });

  it("returns invalid when the message content is not JSON", async () => {
    const { client } = clientWith(chatResponse("plain text answer"));
    const result = await client.complete(REQUEST);
    expect(result).toEqual({ ok: false, json: null, error: "invalid" });
  });

  it("times out when the request hangs", async () => {
    const requests: unknown[] = [];
    const fetchImpl = (async () => {
      requests.push(1);
      return new Promise<Response>(() => {});
    }) as typeof fetch;
    const client = new GitHubModelsClient({
      model: "m",
      token: "t",
      fetchImpl,
      timeoutMs: 10,
    });
    const result = await client.complete(REQUEST);
    expect(result).toEqual({ ok: false, json: null, error: "timeout" });
  });
});
