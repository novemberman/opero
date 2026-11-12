import { EmailPort, type EmailMessage } from "../auth/email/email.port";

export class MemoryEmailService extends EmailPort {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }

  latestToken(pathFragment: string): string {
    for (let i = this.messages.length - 1; i >= 0; i -= 1) {
      const text = this.messages[i]?.text ?? "";
      const urlMatch = text.match(/https?:\/\/\S+/);
      if (!urlMatch) {
        continue;
      }
      const url = urlMatch[0];
      if (!url.includes(pathFragment)) {
        continue;
      }
      const token = new URL(url).searchParams.get("token");
      if (token) {
        return token;
      }
    }
    throw new Error(`No email token found for ${pathFragment}`);
  }
}
