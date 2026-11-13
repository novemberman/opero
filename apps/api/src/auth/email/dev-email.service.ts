import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnv } from "../../config/env";
import { EmailPort, type EmailMessage } from "./email.port";

/**
 * Development mail sink. Writes full messages under MAIL_DIR (gitignored).
 * Staging/production must use Resend via MAIL_DRIVER=resend — never fall back here.
 */
@Injectable()
export class DevEmailService extends EmailPort {
  private readonly logger = new Logger(DevEmailService.name);

  constructor(private readonly config: ConfigService<ApiEnv, true>) {
    super();
  }

  async send(message: EmailMessage): Promise<void> {
    const dir = this.config.get("MAIL_DIR", { infer: true });
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(":", "-");
    const safeTo = message.to.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = join(dir, `${stamp}-${safeTo}.txt`);
    const body = [
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      "",
      message.text,
      "",
      ...(message.html ? ["--- html ---", message.html, ""] : []),
    ].join("\n");
    await writeFile(filePath, body, "utf8");
    this.logger.log(`Dev email written for ${message.to} (${message.subject})`);
  }
}
