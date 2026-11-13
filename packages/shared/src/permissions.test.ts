import { describe, expect, it } from "vitest";
import { roleHasEveryPermission, roleHasPermission, rolePermissions } from "./permissions";

describe("rolePermissions", () => {
  it("denies invite permission to analysts and viewers", () => {
    expect(roleHasPermission("ANALYST", "member:invite")).toBe(false);
    expect(roleHasPermission("VIEWER", "member:invite")).toBe(false);
    expect(roleHasPermission("ADMIN", "member:invite")).toBe(true);
    expect(roleHasPermission("OWNER", "member:invite")).toBe(true);
  });

  it("grants xray write to analysts but not viewers", () => {
    expect(roleHasPermission("ANALYST", "xray:write")).toBe(true);
    expect(roleHasPermission("VIEWER", "xray:write")).toBe(false);
  });

  it("grants xray publish only to owners and admins", () => {
    expect(roleHasPermission("OWNER", "xray:publish")).toBe(true);
    expect(roleHasPermission("ADMIN", "xray:publish")).toBe(true);
    expect(roleHasPermission("ANALYST", "xray:publish")).toBe(false);
    expect(roleHasPermission("VIEWER", "xray:publish")).toBe(false);
  });

  it("requires every listed permission", () => {
    expect(roleHasEveryPermission("VIEWER", ["org:read", "xray:read"])).toBe(true);
    expect(roleHasEveryPermission("VIEWER", ["org:read", "member:invite"])).toBe(false);
  });

  it("lists an explicit matrix for every role", () => {
    expect(Object.keys(rolePermissions).sort()).toEqual([
      "ADMIN",
      "ANALYST",
      "OWNER",
      "VIEWER",
    ]);
  });

  it("restricts billing manage to owners and admins", () => {
    expect(roleHasPermission("OWNER", "billing:manage")).toBe(true);
    expect(roleHasPermission("ADMIN", "billing:manage")).toBe(true);
    expect(roleHasPermission("ANALYST", "billing:manage")).toBe(false);
    expect(roleHasPermission("VIEWER", "billing:manage")).toBe(false);
    expect(roleHasPermission("VIEWER", "billing:read")).toBe(true);
  });
});
