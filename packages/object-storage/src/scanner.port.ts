export type ScanVerdict = "CLEAN" | "INFECTED" | "ERROR" | "UNAVAILABLE";

export type ScanResult = {
  verdict: ScanVerdict;
  signature?: string;
  detail?: string;
};

export abstract class MalwareScannerPort {
  abstract scan(buffer: Buffer): Promise<ScanResult>;
}
