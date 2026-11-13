import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailProviderError } from "./email.errors";
import {
  RESEND_API_BASE_URL,
  ResendEmailService,
  type ResendFetchLike,
} from "./resend-email.service";

const API_KEY = "re_test_secret_value_do_not_log";
const FROM = "Opero <noreply@opero.test>";

type FetchCall = { url: string; init: Parameters<ResendFetchLike>[1] };

function fakeFetch(
  respond: (callIndex: number) => {
    status?: number;
    body?: string;
    headers?: Record<string, string>;
  },
): { fetchImpl: ResendFetchLike; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl: ResendFetchLike = async (url, init) => {
    const callIndex = calls.length;
    calls.push({ url, init });
    const { status = 200, body = JSON.stringify({ id: "email_123" }), headers = {} } =
      respond(callIndex);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get(name: string) {
          return headers[name.toLowerCase()] ?? headers[name] ?? null;
        },
      },
      text: async () => body,
    };
  };
  return { fetchImpl, calls };
}

function service(
  fetchImpl: ResendFetchLike,
  sleep: (ms: number) => Promise<void> = async () => undefined,
) {
  return new ResendEmailService({
    apiKey: API_KEY,
    fromAddress: FROM,
    timeoutMs: 50,
    fetchImpl,
    sleep,
  });
}

async function failure(promise: Promise<unknown>): Promise<EmailProviderError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(EmailProviderError);
  return error as EmailProviderError;
}

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

describe("ResendEmailService", () => {
  it("posts to Resend with bearer auth, user-agent, text+html, and idempotency key", async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({}));
    await service(fetchImpl).send({
      to: "user@example.com",
      subject: "Verify your Opero email",
      text: "Verify: https://app.example/verify-email?token=abc",
      html: "<p>Verify</p>",
      idempotencyKey: "email-verify/abc",
    });

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe(`${RESEND_API_BASE_URL}/emails`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(init.headers["User-Agent"]).toBe("opero-api/1.0");
    expect(init.headers["Idempotency-Key"]).toBe("email-verify/abc");
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const body = JSON.parse(init.body) as {
      from: string;
      to: string[];
      subject: string;
      text: string;
      html: string;
    };
    expect(body.from).toBe(FROM);
    expect(body.to).toEqual(["user@example.com"]);
    expect(body.subject).toBe("Verify your Opero email");
    expect(body.text).toContain("token=abc");
    expect(body.html).toBe("<p>Verify</p>");
    expect(init.body).not.toContain(API_KEY);
  });

  it("does not report success when Resend returns an error envelope on 2xx", async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({
      status: 200,
      body: JSON.stringify({ error: { message: "invalid" } }),
    }));
    const error = await failure(
      service(fetchImpl).send({
        to: "user@example.com",
        subject: "Reset your Opero password",
        text: "reset",
      }),
    );
    expect(error.code).toBe("REJECTED");
    expect(calls).toHaveLength(1);
  });

  it("maps authentication failures without retrying", async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ status: 401, body: "{}" }));
    const error = await failure(
      service(fetchImpl).send({
        to: "user@example.com",
        subject: "Verify your Opero email",
        text: "verify",
      }),
    );
    expect(error.code).toBe("AUTH");
    expect(error.status).toBe(401);
    expect(calls).toHaveLength(1);
  });

  it("retries rate limits with the same idempotency key then succeeds", async () => {
    const sleeps: number[] = [];
    const { fetchImpl, calls } = fakeFetch((index) => {
      if (index === 0) {
        return { status: 429, body: "{}", headers: { "retry-after": "0" } };
      }
      return { status: 200, body: JSON.stringify({ id: "email_ok" }) };
    });

    await service(fetchImpl, async (ms) => {
      sleeps.push(ms);
    }).send({
      to: "user@example.com",
      subject: "Verify your Opero email",
      text: "verify",
      idempotencyKey: "email-verify/stable",
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]!.init.headers["Idempotency-Key"]).toBe("email-verify/stable");
    expect(calls[1]!.init.headers["Idempotency-Key"]).toBe("email-verify/stable");
    expect(sleeps.length).toBeGreaterThanOrEqual(1);
  });

  it("retries timeouts then surfaces TIMEOUT", async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({
      status: 200,
      body: JSON.stringify({ id: "never" }),
    }));
    const hanging: ResendFetchLike = async (url, init) => {
      calls.push({ url, init });
      await new Promise((resolve) => setTimeout(resolve, 200));
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify({ id: "late" }),
      };
    };

    const error = await failure(
      new ResendEmailService({
        apiKey: API_KEY,
        fromAddress: FROM,
        timeoutMs: 20,
        fetchImpl: hanging,
        sleep: async () => undefined,
      }).send({
        to: "user@example.com",
        subject: "Verify your Opero email",
        text: "verify",
      }),
    );
    expect(error.code).toBe("TIMEOUT");
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects missing configuration without calling the network", async () => {
    expect(() => new ResendEmailService({ apiKey: "", fromAddress: FROM })).toThrow(
      /RESEND_API_KEY/,
    );
    expect(() => new ResendEmailService({ apiKey: API_KEY, fromAddress: "" })).toThrow(
      /MAIL_FROM_ADDRESS/,
    );
  });
});
