import { MockAiProvider } from "./providers/mock.js";
import {
  OpenAiCompatibleProvider,
  type OpenAiCompatibleProviderOptions,
} from "./providers/openai-compatible.js";
import { AiProviderError, type AiProviderPort } from "./types.js";

export type CreateAiProviderOptions =
  | { provider?: "mock" }
  | ({ provider: "openai" } & OpenAiCompatibleProviderOptions);

/**
 * Creates a provider. Defaults to the mock, so nothing reaches a network
 * unless `provider: "openai"` is requested explicitly.
 */
export function createAiProvider(options: CreateAiProviderOptions = {}): AiProviderPort {
  if (options.provider === "openai") {
    const { provider: _provider, ...openAiOptions } = options;
    return new OpenAiCompatibleProvider(openAiOptions);
  }
  if (options.provider === undefined || options.provider === "mock") {
    return new MockAiProvider();
  }
  // Reachable only from untyped callers (config strings, plain JS).
  throw new AiProviderError("CONFIG", `Unknown AI provider "${String(options.provider)}"`);
}

type Env = Record<string, string | undefined>;

/**
 * Reads provider settings from the environment:
 * `AI_PROVIDER` (`mock` by default, or `openai`), `OPENAI_API_KEY`,
 * `OPENAI_MODEL`, `OPENAI_BASE_URL` and `AI_TIMEOUT_MS`.
 *
 * Selecting `openai` without a key or model throws rather than silently
 * falling back to simulated output.
 */
export function createAiProviderFromEnv(env: Env = process.env): AiProviderPort {
  const provider = (env.AI_PROVIDER ?? "").trim().toLowerCase() || "mock";
  if (provider === "mock") return new MockAiProvider();
  if (provider !== "openai") {
    throw new AiProviderError("CONFIG", `Unknown AI provider "${provider}"`);
  }

  const rawTimeout = env.AI_TIMEOUT_MS?.trim();
  return new OpenAiCompatibleProvider({
    apiKey: env.OPENAI_API_KEY ?? "",
    model: env.OPENAI_MODEL ?? "",
    baseUrl: env.OPENAI_BASE_URL,
    timeoutMs: rawTimeout ? Number(rawTimeout) : undefined,
  });
}
