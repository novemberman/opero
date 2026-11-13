import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAiContext } from "../context.js";
import { PROMPT_VERSION, SYSTEM_PROMPT } from "../prompt.js";
import { factsFixture, narrativeFixture } from "../test-fixtures.js";
import { AiProviderError } from "../types.js";
import { OpenAiCompatibleProvider, type FetchLike } from "./openai-compatible.js";

const API_KEY = "sk-test-secret-value";

type FetchCall = { url: string; init: Parameters<FetchLike>[1] };

function completion(content: unknown, model = "served-model-1"): string {
  return JSON.stringify({ model, choices: [{ message: { role: "assistant", content } }] });
}

function fakeFetch(respond: () => { status?: number; body: string }): {
  fetchImpl: FetchLike;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const { status = 200, body } = respond();
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
  return { fetchImpl, calls };
}

function provider(fetchImpl: FetchLike, overrides: { timeoutMs?: number; baseUrl?: string } = {}) {
  return new OpenAiCompatibleProvider({
    apiKey: API_KEY,
    model: "test-model",
    baseUrl: "https://llm.example.test/v1/",
    fetchImpl,
    ...overrides,
  });
}

async function failure(promise: Promise<unknown>): Promise<AiProviderError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AiProviderError);
  return error as AiProviderError;
}

const context = buildAiContext(factsFixture());

// Every test injects `fetchImpl`. A real request would fail the test loudly.
let globalFetch: ReturnType<typeof vi.fn>;
beforeEach(() => {
  globalFetch = vi.fn(() => {
    throw new Error("network access is not allowed in tests");
  });
  vi.stubGlobal("fetch", globalFetch);
});
afterEach(() => {
  expect(globalFetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("OpenAiCompatibleProvider", () => {
  it("posts the prompt to {baseUrl}/chat/completions and returns the validated narrative", async () => {
    const narrative = narrativeFixture();
    const { fetchImpl, calls } = fakeFetch(() => ({ body: completion(JSON.stringify(narrative)) }));

    const result = await provider(fetchImpl).interpret(context);

    expect(result).toEqual({
      narrative,
      provider: "openai",
      model: "served-model-1",
      promptVersion: PROMPT_VERSION,
      isSimulated: false,
    });

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe("https://llm.example.test/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe(`Bearer ${API_KEY}`);
    expect(init.headers["content-type"]).toBe("application/json");
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const body = JSON.parse(init.body) as {
      model: string;
      temperature: number;
      response_format: unknown;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe("test-model");
    expect(body.temperature).toBe(0);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(body.messages[0]?.content).toBe(SYSTEM_PROMPT);
    expect(body.messages[1]?.content).toContain('"code": "CURRENT_RATIO"');
    expect(init.body).not.toContain(API_KEY);
  });

  it("falls back to the configured model name when the response omits it", async () => {
    const body = JSON.stringify({
      choices: [{ message: { content: JSON.stringify(narrativeFixture()) } }],
    });
    const { fetchImpl } = fakeFetch(() => ({ body }));

    const result = await provider(fetchImpl).interpret(context);

    expect(result.model).toBe("test-model");
  });

  it("accepts fenced JSON content", async () => {
    const narrative = narrativeFixture();
    const { fetchImpl } = fakeFetch(() => ({
      body: completion("```json\n" + JSON.stringify(narrative) + "\n```"),
    }));

    const result = await provider(fetchImpl).interpret(context);

    expect(result.narrative).toEqual(narrative);
  });

  it("omits response_format when JSON mode is disabled", async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({
      body: completion(JSON.stringify(narrativeFixture())),
    }));

    await new OpenAiCompatibleProvider({
      apiKey: API_KEY,
      model: "test-model",
      jsonMode: false,
      fetchImpl,
    }).interpret(context);

    expect(JSON.parse(calls[0]!.init.body)).not.toHaveProperty("response_format");
    expect(calls[0]!.url).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("throws on a non-2xx response without leaking the body or the key", async () => {
    const { fetchImpl } = fakeFetch(() => ({
      status: 500,
      body: `upstream exploded while handling key ${API_KEY}`,
    }));

    const error = await failure(provider(fetchImpl).interpret(context));

    expect(error.code).toBe("HTTP_ERROR");
    expect(error.status).toBe(500);
    expect(error.message).toBe("AI provider responded with HTTP 500");
    expect(error.message).not.toContain(API_KEY);
  });

  it("throws when the transport fails", async () => {
    const cause = new TypeError(`connect ECONNREFUSED with ${API_KEY}`);
    const fetchImpl: FetchLike = async () => {
      throw cause;
    };

    const error = await failure(provider(fetchImpl).interpret(context));

    expect(error.code).toBe("NETWORK");
    expect(error.cause).toBe(cause);
    expect(error.message).not.toContain(API_KEY);
  });

  it("times out and aborts a request that never completes", async () => {
    let signal: AbortSignal | undefined;
    const fetchImpl: FetchLike = (_url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    };

    const started = Date.now();
    const error = await failure(provider(fetchImpl, { timeoutMs: 25 }).interpret(context));

    expect(error.code).toBe("TIMEOUT");
    expect(error.message).toBe("AI provider timed out after 25 ms");
    expect(signal?.aborted).toBe(true);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("times out when the body never finishes", async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: () => new Promise<string>(() => {}),
    });

    const error = await failure(provider(fetchImpl, { timeoutMs: 25 }).interpret(context));

    expect(error.code).toBe("TIMEOUT");
  });

  it.each([
    ["a non-JSON envelope", "<html>502 Bad Gateway</html>"],
    ["an envelope without choices", JSON.stringify({ model: "m" })],
    ["empty choices", JSON.stringify({ choices: [] })],
    ["empty content", completion("   ")],
    ["non-string content", completion({ summary: "object, not text" })],
    ["a JSON null envelope", "null"],
  ])("throws INVALID_RESPONSE for %s", async (_name, body) => {
    const { fetchImpl } = fakeFetch(() => ({ body }));

    const error = await failure(provider(fetchImpl).interpret(context));

    expect(error.code).toBe("INVALID_RESPONSE");
  });

  it.each([
    ["prose instead of JSON", "The company looks healthy overall."],
    ["JSON missing required fields", JSON.stringify({ summary: "Only a summary" })],
    [
      "JSON with the wrong field types",
      JSON.stringify({ ...narrativeFixture(), claims: "none" }),
    ],
  ])("throws INVALID_OUTPUT for %s", async (_name, content) => {
    const { fetchImpl } = fakeFetch(() => ({ body: completion(content) }));

    const error = await failure(provider(fetchImpl).interpret(context));

    expect(error.code).toBe("INVALID_OUTPUT");
  });

  it.each([
    ["a missing API key", { apiKey: " ", model: "m" }],
    ["a missing model", { apiKey: API_KEY, model: "" }],
    ["a malformed base URL", { apiKey: API_KEY, model: "m", baseUrl: "not a url" }],
    ["a non-http base URL", { apiKey: API_KEY, model: "m", baseUrl: "file:///etc/passwd" }],
    ["a non-positive timeout", { apiKey: API_KEY, model: "m", timeoutMs: 0 }],
    ["a non-numeric timeout", { apiKey: API_KEY, model: "m", timeoutMs: Number.NaN }],
  ])("rejects %s at construction", (_name, options) => {
    let thrown: unknown;
    try {
      new OpenAiCompatibleProvider(options);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AiProviderError);
    expect((thrown as AiProviderError).code).toBe("CONFIG");
    expect((thrown as AiProviderError).message).not.toContain(API_KEY);
  });
});
