import { buildMessages, PROMPT_VERSION } from "../prompt.js";
import { AiOutputValidationError, parseAiNarrativeJson } from "../schema.js";
import {
  AiProviderError,
  type AiInterpretationContext,
  type AiInterpretationResult,
  type AiProviderPort,
} from "../types.js";

export const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const OPENAI_DEFAULT_TIMEOUT_MS = 30_000;

const MAX_RESPONSE_CHARS = 1_000_000;

export type FetchLike = (
  input: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type OpenAiCompatibleProviderOptions = {
  apiKey: string;
  model: string;
  /** API root such as `https://api.openai.com/v1`. `/chat/completions` is appended. */
  baseUrl?: string;
  /** Covers the whole request including reading the body. */
  timeoutMs?: number;
  /** Sends `response_format: {type: "json_object"}`. Disable for servers that reject it. */
  jsonMode?: boolean;
  /** Injected in tests so no request ever leaves the process. */
  fetchImpl?: FetchLike;
};

function resolveEndpoint(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new AiProviderError("CONFIG", "OpenAI-compatible base URL is not a valid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AiProviderError("CONFIG", "OpenAI-compatible base URL must use http or https");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}/chat/completions`;
}

function readCompletion(body: string): { content: string; model: string | null } {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new AiProviderError("INVALID_RESPONSE", "AI provider returned a non-JSON response");
  }
  const root = payload as {
    model?: unknown;
    choices?: Array<{ message?: { content?: unknown } } | null>;
  } | null;
  const content = root?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new AiProviderError("INVALID_RESPONSE", "AI provider response has no message content");
  }
  return { content, model: typeof root?.model === "string" ? root.model : null };
}

/**
 * Calls an OpenAI-compatible `POST {baseUrl}/chat/completions` endpoint and
 * validates the reply against the narrative schema. Any failure — transport,
 * timeout, non-2xx status, malformed envelope or schema mismatch — throws
 * `AiProviderError`; there is no fallback narrative.
 */
export class OpenAiCompatibleProvider implements AiProviderPort {
  readonly name = "openai" as const;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly jsonMode: boolean;
  private readonly fetchImpl: FetchLike;

  constructor(options: OpenAiCompatibleProviderOptions) {
    const apiKey = options.apiKey?.trim();
    const model = options.model?.trim();
    if (!apiKey) throw new AiProviderError("CONFIG", "OpenAI-compatible provider requires an API key");
    if (!model) throw new AiProviderError("CONFIG", "OpenAI-compatible provider requires a model");
    const timeoutMs = options.timeoutMs ?? OPENAI_DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new AiProviderError("CONFIG", "AI provider timeout must be a positive number");
    }
    this.apiKey = apiKey;
    this.model = model;
    this.endpoint = resolveEndpoint(options.baseUrl?.trim() || OPENAI_DEFAULT_BASE_URL);
    this.timeoutMs = timeoutMs;
    this.jsonMode = options.jsonMode ?? true;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  async interpret(context: AiInterpretationContext): Promise<AiInterpretationResult> {
    const body = await this.request(
      JSON.stringify({
        model: this.model,
        temperature: 0,
        messages: buildMessages(context),
        ...(this.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    );
    const completion = readCompletion(body);

    try {
      return {
        narrative: parseAiNarrativeJson(completion.content),
        provider: this.name,
        model: completion.model ?? this.model,
        promptVersion: PROMPT_VERSION,
        isSimulated: false,
      };
    } catch (error) {
      if (error instanceof AiOutputValidationError) {
        throw new AiProviderError("INVALID_OUTPUT", error.message, { cause: error });
      }
      throw error;
    }
  }

  private async request(requestBody: string): Promise<string> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Raced against the request as well as aborting it, so a fetch
    // implementation that ignores the signal still cannot hang the caller.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new AiProviderError("TIMEOUT", `AI provider timed out after ${this.timeoutMs} ms`));
        controller.abort();
      }, this.timeoutMs);
    });

    try {
      const response = await Promise.race([
        this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: requestBody,
          signal: controller.signal,
        }),
        timeout,
      ]);
      if (!response.ok) {
        throw new AiProviderError(
          "HTTP_ERROR",
          `AI provider responded with HTTP ${response.status}`,
          { status: response.status },
        );
      }
      const text = await Promise.race([response.text(), timeout]);
      if (text.length > MAX_RESPONSE_CHARS) {
        throw new AiProviderError("INVALID_RESPONSE", "AI provider response is too large");
      }
      return text;
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      // The underlying error is kept as `cause` only; its message may echo
      // request details and is not repeated here.
      throw new AiProviderError("NETWORK", "AI provider request failed", { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }
}
