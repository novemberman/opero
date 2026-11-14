import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { createCsrf } from "./csrf";

function mockRes() {
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const res = {
    cookie: vi.fn((name: string, value: string, options: Record<string, unknown>) => {
      cookies.push({ name, value, options });
      return res;
    }),
  } as unknown as Response;
  return { res, cookies };
}

describe("createCsrf cookie policy", () => {
  const baseEnv = {
    CSRF_SECRET: "test-csrf-secret-at-least-32-chars!!",
    CSRF_COOKIE_NAME: "opero_csrf",
    NODE_ENV: "production" as const,
    SESSION_COOKIE_NAME: "opero_session",
    COOKIE_SECURE: true as boolean | undefined,
    COOKIE_DOMAIN: undefined as string | undefined,
  };

  it("issues HttpOnly Secure SameSite=Lax CSRF cookies (same-origin proxy safe)", () => {
    const helpers = createCsrf(baseEnv);
    const { res, cookies } = mockRes();
    const req = { cookies: {} } as Request;

    const token = helpers.generateCsrfToken(req, res);
    expect(token).toMatch(/^[a-f0-9]+\.[a-f0-9]+$/i);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.name).toBe("opero_csrf");
    expect(cookies[0]?.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    });
    expect(cookies[0]?.options.domain).toBeUndefined();
  });

  it("rejects mutating requests without a matching CSRF header", () => {
    const helpers = createCsrf(baseEnv);
    const { res, cookies } = mockRes();
    const issueReq = { cookies: { opero_session: "session-a" } } as unknown as Request;
    const token = helpers.generateCsrfToken(issueReq, res);
    const csrfCookie = cookies[0]?.value ?? "";

    const next = vi.fn();
    const badReq = {
      method: "POST",
      cookies: {
        opero_session: "session-a",
        opero_csrf: csrfCookie,
      },
      headers: {},
    } as unknown as Request;

    helpers.doubleCsrfProtection(badReq, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "EBADCSRFTOKEN" });

    const okNext = vi.fn();
    const goodReq = {
      method: "POST",
      cookies: {
        opero_session: "session-a",
        opero_csrf: csrfCookie,
      },
      headers: { "x-csrf-token": token },
    } as unknown as Request;
    helpers.doubleCsrfProtection(goodReq, res, okNext);
    expect(okNext).toHaveBeenCalledWith();
  });

  it("rejects CSRF tokens bound to a different session identifier", () => {
    const helpers = createCsrf(baseEnv);
    const { res, cookies } = mockRes();
    const anonReq = { cookies: {} } as Request;
    const anonToken = helpers.generateCsrfToken(anonReq, res);
    const csrfCookie = cookies[0]?.value ?? "";

    const next = vi.fn();
    const authedReq = {
      method: "POST",
      cookies: {
        opero_session: "session-after-login",
        opero_csrf: csrfCookie,
      },
      headers: { "x-csrf-token": anonToken },
    } as unknown as Request;

    helpers.doubleCsrfProtection(authedReq, res, next);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "EBADCSRFTOKEN" });
  });
});
