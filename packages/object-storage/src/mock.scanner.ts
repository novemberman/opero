import { MalwareScannerPort, type ScanResult, type ScanVerdict } from "./scanner.port.js";

export class MockMalwareScanner extends MalwareScannerPort {
  constructor(private readonly verdict: ScanVerdict = "CLEAN", private readonly detail?: string) {
    super();
  }

  async scan(_buffer: Buffer): Promise<ScanResult> {
    return { verdict: this.verdict, detail: this.detail };
  }
}
