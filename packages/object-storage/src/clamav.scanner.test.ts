import { describe, expect, it } from "vitest";
import { ClamAvScanner } from "./clamav.scanner.js";
import { MockMalwareScanner } from "./mock.scanner.js";

describe("malware scanners", () => {
  it("mock fail-closes when unavailable", async () => {
    const scanner = new MockMalwareScanner("UNAVAILABLE");
    const result = await scanner.scan(Buffer.from("clean,csv,data\n1,2,3\n"));
    expect(result.verdict).toBe("UNAVAILABLE");
  });

  it("mock detects infected fixtures", async () => {
    const scanner = new MockMalwareScanner("INFECTED");
    const result = await scanner.scan(Buffer.from("x"));
    expect(result.verdict).toBe("INFECTED");
  });

  it("ClamAV fail-closes when host is unreachable", async () => {
    const scanner = new ClamAvScanner("127.0.0.1", 1, 500);
    const result = await scanner.scan(Buffer.from("hello"));
    expect(result.verdict).toBe("UNAVAILABLE");
  });
});
