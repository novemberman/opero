// Control chars intentionally rejected in uploaded filenames.
const UNSAFE = new RegExp(`[<>:"|?*${String.fromCharCode(0)}-${String.fromCharCode(0x1f)}]`, "g");

/**
 * Strip path components and unsafe characters. Never use client path segments for storage keys.
 */
export function sanitizeOriginalFilename(input: string): string {
  const base = input.replaceAll("\\", "/").split("/").pop() ?? "upload";
  const cleaned = base.replace(UNSAFE, "_").replace(/^\.+/, "").trim();
  if (!cleaned || cleaned === "." || cleaned === "..") {
    return "upload.bin";
  }
  return cleaned.slice(0, 180);
}

export function assertSafeFilename(input: string): void {
  if (input.includes("..") || input.includes("/") || input.includes("\\")) {
    throw new Error("Unsafe filename rejected");
  }
}
