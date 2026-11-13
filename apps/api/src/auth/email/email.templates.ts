import type { EmailMessage } from "./email.port";

const BRAND = "Opero";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function brandedHtml(params: {
  title: string;
  greeting: string;
  paragraphs: string[];
  actionLabel: string;
  actionUrl: string;
  footer: string;
}): string {
  const paragraphs = params.paragraphs
    .map((p) => `<p style="margin:0 0 16px;line-height:1.5;color:#1f2937;">${escapeHtml(p)}</p>`)
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(params.title)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;">
          <tr>
            <td style="padding:28px 32px 12px;font-size:28px;letter-spacing:0.04em;color:#0f172a;">
              ${escapeHtml(BRAND)}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 0;font-size:20px;color:#111827;">
              ${escapeHtml(params.title)}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 8px;font-size:16px;color:#1f2937;">
              <p style="margin:0 0 16px;line-height:1.5;">${escapeHtml(params.greeting)}</p>
              ${paragraphs}
              <p style="margin:24px 0;">
                <a href="${escapeHtml(params.actionUrl)}"
                   style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;">
                  ${escapeHtml(params.actionLabel)}
                </a>
              </p>
              <p style="margin:0 0 16px;line-height:1.5;color:#4b5563;font-size:14px;">
                Or open this link:<br>
                <a href="${escapeHtml(params.actionUrl)}" style="color:#0f172a;word-break:break-all;">
                  ${escapeHtml(params.actionUrl)}
                </a>
              </p>
              <p style="margin:24px 0 0;line-height:1.5;color:#6b7280;font-size:13px;">
                ${escapeHtml(params.footer)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 28px;font-size:12px;color:#9ca3af;">
              ${escapeHtml(BRAND)} transactional message
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildVerificationEmail(input: {
  to: string;
  appOrigin: string;
  token: string;
  ttlHours: number;
}): EmailMessage {
  const actionUrl = `${input.appOrigin}/verify-email?token=${input.token}`;
  const ttl = Math.max(1, Math.floor(input.ttlHours));
  const text = [
    `Verify your ${BRAND} email`,
    "",
    `Please verify your email address for your ${BRAND} account:`,
    actionUrl,
    "",
    `This link expires in ${ttl} hour${ttl === 1 ? "" : "s"}.`,
    "",
    `If you did not create a ${BRAND} account, you can ignore this message.`,
    "",
    `— ${BRAND}`,
  ].join("\n");

  return {
    to: input.to,
    subject: `Verify your ${BRAND} email`,
    text,
    html: brandedHtml({
      title: `Verify your ${BRAND} email`,
      greeting: `Please verify your email address for your ${BRAND} account.`,
      paragraphs: [`This link expires in ${ttl} hour${ttl === 1 ? "" : "s"}.`],
      actionLabel: "Verify email",
      actionUrl,
      footer: `If you did not create a ${BRAND} account, you can ignore this message.`,
    }),
    idempotencyKey: `email-verify/${input.token}`,
  };
}

export function buildPasswordResetEmail(input: {
  to: string;
  appOrigin: string;
  token: string;
  ttlHours: number;
}): EmailMessage {
  const actionUrl = `${input.appOrigin}/reset-password?token=${input.token}`;
  const ttl = Math.max(1, Math.floor(input.ttlHours));
  const text = [
    `Reset your ${BRAND} password`,
    "",
    `We received a request to reset the password for your ${BRAND} account:`,
    actionUrl,
    "",
    `This link expires in ${ttl} hour${ttl === 1 ? "" : "s"}.`,
    "",
    `If you did not request a password reset, you can ignore this message. Your password will stay the same.`,
    "",
    `— ${BRAND}`,
  ].join("\n");

  return {
    to: input.to,
    subject: `Reset your ${BRAND} password`,
    text,
    html: brandedHtml({
      title: `Reset your ${BRAND} password`,
      greeting: `We received a request to reset the password for your ${BRAND} account.`,
      paragraphs: [`This link expires in ${ttl} hour${ttl === 1 ? "" : "s"}.`],
      actionLabel: "Reset password",
      actionUrl,
      footer:
        "If you did not request a password reset, you can ignore this message. Your password will stay the same.",
    }),
    idempotencyKey: `password-reset/${input.token}`,
  };
}
