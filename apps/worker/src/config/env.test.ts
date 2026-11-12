import { describe, expect, it } from "vitest";
import { parseWorkerEnv } from "./env";

describe("parseWorkerEnv", () => {
  it("reads the Redis connection from the environment", () => {
    const env = parseWorkerEnv({
      REDIS_HOST: "127.0.0.1",
      REDIS_PORT: "63799",
      REDIS_PASSWORD: "local-dev-password",
    });

    expect(env).toMatchObject({
      REDIS_HOST: "127.0.0.1",
      REDIS_PORT: 63799,
      REDIS_PASSWORD: "local-dev-password",
    });
  });

  it("rejects a missing Redis password", () => {
    expect(() => parseWorkerEnv({ REDIS_HOST: "127.0.0.1" })).toThrow(/Invalid worker environment/);
  });
});
