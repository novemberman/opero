import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAiContext } from "./context.js";
import { createAiProvider, createAiProviderFromEnv, type CreateAiProviderOptions } from "./factory.js";
import { MockAiProvider } from "./providers/mock.js";
import { OpenAiCompatibleProvider } from "./providers/openai-compatible.js";
import { factsFixture } from "./test-fixtures.js";
import { AiProviderError } from "./types.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function configError(run: () => unknown): AiProviderError {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(AiProviderError);
  expect((thrown as AiProviderError).code).toBe("CONFIG");
  return thrown as AiProviderError;
}

describe("createAiProvider", () => {
  it("defaults to the mock provider", () => {
    expect(createAiProvider()).toBeInstanceOf(MockAiProvider);
    expect(createAiProvider({})).toBeInstanceOf(MockAiProvider);
    expect(createAiProvider({ provider: "mock" })).toBeInstanceOf(MockAiProvider);
  });

  it("returns a simulated, offline provider by default", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("network access is not allowed in tests");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const provider = createAiProvider();
    const result = await provider.interpret(buildAiContext(factsFixture()));

    expect(provider.name).toBe("mock");
    expect(result.isSimulated).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("creates the OpenAI-compatible provider when requested", () => {
    const provider = createAiProvider({
      provider: "openai",
      apiKey: "sk-test",
      model: "test-model",
      baseUrl: "https://llm.example.test/v1",
    });

    expect(provider).toBeInstanceOf(OpenAiCompatibleProvider);
    expect(provider.name).toBe("openai");
  });

  it("does not fall back to the mock when OpenAI settings are incomplete", () => {
    configError(() => createAiProvider({ provider: "openai", apiKey: "", model: "test-model" }));
  });

  it("rejects an unknown provider name", () => {
    const error = configError(() =>
      createAiProvider({ provider: "anthropic" } as unknown as CreateAiProviderOptions),
    );

    expect(error.message).toBe('Unknown AI provider "anthropic"');
  });
});

describe("createAiProviderFromEnv", () => {
  it("defaults to the mock provider when AI_PROVIDER is unset or blank", () => {
    expect(createAiProviderFromEnv({})).toBeInstanceOf(MockAiProvider);
    expect(createAiProviderFromEnv({ AI_PROVIDER: "  " })).toBeInstanceOf(MockAiProvider);
    expect(createAiProviderFromEnv({ AI_PROVIDER: "MOCK" })).toBeInstanceOf(MockAiProvider);
  });

  it("ignores OpenAI credentials unless the provider is selected", () => {
    const provider = createAiProviderFromEnv({ OPENAI_API_KEY: "sk-test", OPENAI_MODEL: "m" });

    expect(provider).toBeInstanceOf(MockAiProvider);
  });

  it("creates the OpenAI-compatible provider from environment settings", () => {
    const provider = createAiProviderFromEnv({
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
      OPENAI_MODEL: "test-model",
      OPENAI_BASE_URL: "https://llm.example.test/v1",
      AI_TIMEOUT_MS: "5000",
    });

    expect(provider).toBeInstanceOf(OpenAiCompatibleProvider);
  });

  it.each([
    ["no API key", { AI_PROVIDER: "openai", OPENAI_MODEL: "test-model" }],
    ["no model", { AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" }],
    [
      "an invalid timeout",
      { AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-test", OPENAI_MODEL: "m", AI_TIMEOUT_MS: "soon" },
    ],
    ["an unknown provider", { AI_PROVIDER: "llama" }],
  ])("throws a config error for %s", (_name, env) => {
    configError(() => createAiProviderFromEnv(env));
  });
});
