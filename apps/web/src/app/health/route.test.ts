import { healthResponseSchema } from "@opero/shared";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /health", () => {
  it("returns the shared web health contract", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    const parsed = healthResponseSchema.parse(body);
    expect(parsed).toMatchObject({ status: "ok", service: "web" });
  });
});
