import { describe, expect, it } from "vitest";
import { parseApiEnv } from "./env";

describe("parseApiEnv", () => {
  it("applies loopback defaults", () => {
    expect(parseApiEnv({})).toMatchObject({
      NODE_ENV: "development",
      API_HOST: "127.0.0.1",
      API_PORT: 3001,
      LOG_LEVEL: "info",
    });
  });

  it("coerces a string port and keeps configured origins", () => {
    const env = parseApiEnv({
      API_PORT: "4100",
      CORS_ORIGINS: "http://127.0.0.1:3000",
      LOG_LEVEL: "debug",
    });

    expect(env.API_PORT).toBe(4100);
    expect(env.CORS_ORIGINS).toBe("http://127.0.0.1:3000");
    expect(env.LOG_LEVEL).toBe("debug");
  });

  it("rejects an invalid port", () => {
    expect(() => parseApiEnv({ API_PORT: "0" })).toThrow(/Invalid API environment/);
  });
});
