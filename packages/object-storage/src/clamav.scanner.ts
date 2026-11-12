import { createConnection } from "node:net";
import { MalwareScannerPort, type ScanResult } from "./scanner.port.js";

/**
 * ClamAV clamd INSTREAM scanner. Fail closed on connection/protocol errors.
 */
export class ClamAvScanner extends MalwareScannerPort {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = 30_000,
  ) {
    super();
  }

  async scan(buffer: Buffer): Promise<ScanResult> {
    try {
      const response = await this.instream(buffer);
      if (response.includes("OK") && !response.includes("FOUND")) {
        return { verdict: "CLEAN" };
      }
      if (response.includes("FOUND")) {
        const signature = response.replace("stream: ", "").replace(" FOUND", "").trim();
        return { verdict: "INFECTED", signature };
      }
      return { verdict: "ERROR", detail: response };
    } catch (error) {
      return {
        verdict: "UNAVAILABLE",
        detail: error instanceof Error ? error.message : "scanner unavailable",
      };
    }
  }

  private instream(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: this.host, port: this.port });
      let data = "";
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("ClamAV scan timeout"));
      }, this.timeoutMs);

      socket.on("connect", () => {
        socket.write("zINSTREAM\0");
        const chunkSize = 2048;
        for (let offset = 0; offset < buffer.length; offset += chunkSize) {
          const chunk = buffer.subarray(offset, offset + chunkSize);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length, 0);
          socket.write(size);
          socket.write(chunk);
        }
        const end = Buffer.alloc(4);
        end.writeUInt32BE(0, 0);
        socket.write(end);
      });
      socket.on("data", (chunk) => {
        data += chunk.toString("utf8");
      });
      socket.on("end", () => {
        clearTimeout(timer);
        resolve(data.trim());
      });
      socket.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }
}
