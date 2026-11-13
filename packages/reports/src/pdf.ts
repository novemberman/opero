import PDFDocument from "pdfkit";
import type { ReportAiNarrative, ReportMetric, ReportModel } from "./model.js";

export const NON_VERIFIED_BANNER = "Non-verified / limitations-forward";
export const SIMULATED_AI_LABEL = "Simulated interpretation — not live AI";
export const LIVE_AI_LABEL = "AI-generated interpretation";
export const FOOTER_DISCLOSURE =
  "Not an audit opinion, credit rating or advice. See Disclosures.";

type Doc = InstanceType<typeof PDFDocument>;

const MARGIN = 50;
/** Space kept free at the bottom of every page for the footer. */
const BOTTOM_MARGIN = 72;
const FOOTER_OFFSET = 46;

/** Metric table body text. Values too wide for their column shrink to the minimum. */
const ROW_FONT_SIZE = 10;
const MIN_VALUE_FONT_SIZE = 7;
/** Helvetica ascender as a fraction of the font size (718 / 1000 in its AFM). */
const HELVETICA_ASCENT = 0.718;

const FONT = { regular: "Helvetica", bold: "Helvetica-Bold" } as const;
const COLOR = {
  text: "#1A202C",
  muted: "#5A6472",
  rule: "#CBD2D9",
  bannerFill: "#FFF4D6",
  bannerBorder: "#B7791F",
  bannerText: "#5F370E",
} as const;

/** Printable characters outside Latin-1 that the built-in PDF fonts can encode. */
const WIN_ANSI_EXTRAS = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

const REPLACEMENTS: Record<string, string> = {
  "\u2212": "-", // minus sign
  "\u2010": "-", // hyphen
  "\u2011": "-", // non-breaking hyphen
  "\u2009": " ", // thin space
  "\u202F": " ", // narrow no-break space
  "\u00A0": " ", // no-break space
};

/**
 * The built-in PDF fonts only cover Windows-1252. Characters outside it would
 * corrupt the text stream, so they are replaced with "?" rather than dropped,
 * which keeps the omission visible to the reader.
 */
export function toPdfText(value: string): string {
  let out = "";
  for (const char of value.normalize("NFC")) {
    const mapped = REPLACEMENTS[char] ?? char;
    const code = mapped.codePointAt(0) ?? 0;
    if (mapped === "\n" || mapped === "\t") out += " ";
    else if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) continue;
    else if (code <= 0xff || WIN_ANSI_EXTRAS.has(mapped)) out += mapped;
    else out += "?";
  }
  return out;
}

/**
 * Rounds a plain decimal string half away from zero for display, without
 * passing through floating point. Returns null if the input is not a plain
 * decimal, in which case callers print the original text.
 */
export function roundDecimalString(value: string, fractionDigits: number): string | null {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const integer = match[2] ?? "0";
  const fraction = match[3] ?? "";

  let scaled = BigInt(integer + fraction.slice(0, fractionDigits).padEnd(fractionDigits, "0"));
  if ((fraction[fractionDigits] ?? "0") >= "5") scaled += 1n;

  const digits = scaled.toString().padStart(fractionDigits + 1, "0");
  const whole = digits.slice(0, digits.length - fractionDigits);
  const rest = digits.slice(digits.length - fractionDigits).replace(/0+$/, "");
  const sign = match[1] === "-" && scaled !== 0n ? "-" : "";
  return `${sign}${whole}${rest ? `.${rest}` : ""}`;
}

function groupThousands(value: string): string {
  const [whole = "", fraction] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** Display form of a metric value. Rounds for readability only; never derives a value. */
export function formatMetricValue(metric: Pick<ReportMetric, "value" | "unit">): string {
  if (metric.value === null) return "—";
  const isCurrency = metric.unit === "currency";
  const rounded = roundDecimalString(metric.value, isCurrency ? 2 : 4);
  if (rounded === null) return metric.value;
  return isCurrency ? groupThousands(rounded) : rounded;
}

function formatUnit(metric: ReportMetric, currency: string | null): string {
  if (metric.unit === "currency") return currency ?? "currency";
  return metric.unit ?? "";
}

type TextStyle = {
  font?: string;
  size?: number;
  color?: string;
  indent?: number;
  gap?: number;
};

class ReportWriter {
  private readonly doc: Doc;
  private readonly width: number;

  constructor(doc: Doc) {
    this.doc = doc;
    this.width = doc.page.width - MARGIN * 2;
  }

  private get bottom(): number {
    return this.doc.page.height - BOTTOM_MARGIN;
  }

  private ensureSpace(height: number): void {
    if (this.doc.y + height > this.bottom) this.doc.addPage();
  }

  private gap(points: number): void {
    this.doc.y += points;
  }

  private text(value: string, style: TextStyle = {}): void {
    const indent = style.indent ?? 0;
    this.doc
      .font(style.font ?? FONT.regular)
      .fontSize(style.size ?? 10)
      .fillColor(style.color ?? COLOR.text)
      .text(toPdfText(value), MARGIN + indent, this.doc.y, {
        width: this.width - indent,
        lineGap: 2,
      });
    this.gap(style.gap ?? 4);
  }

  private heading(value: string): void {
    // Enough room for the heading plus its first lines, so it is never orphaned.
    this.ensureSpace(96);
    this.gap(10);
    this.text(value, { font: FONT.bold, size: 13, gap: 2 });
    this.rule();
    this.gap(6);
  }

  private subheading(value: string): void {
    this.ensureSpace(60);
    this.gap(4);
    this.text(value, { font: FONT.bold, size: 10.5 });
  }

  private rule(): void {
    const y = this.doc.y;
    this.doc
      .moveTo(MARGIN, y)
      .lineTo(MARGIN + this.width, y)
      .lineWidth(0.5)
      .strokeColor(COLOR.rule)
      .stroke();
  }

  /**
   * Largest size, from the row size down to `MIN_VALUE_FONT_SIZE`, at which
   * `value` fits `width` on a single line. Text too long even at the minimum
   * is left to wrap at that size.
   */
  private fitSize(value: string, width: number): number {
    const natural = this.doc.font(FONT.regular).fontSize(ROW_FONT_SIZE).widthOfString(value);
    if (natural <= width) return ROW_FONT_SIZE;
    // Rounded down to a tenth of a point, with a hair of slack for rounding.
    const fitted = Math.floor(((ROW_FONT_SIZE * width) / natural) * 10 - 0.01) / 10;
    return Math.max(MIN_VALUE_FONT_SIZE, fitted);
  }

  private bullets(items: readonly string[]): void {
    for (const item of items) {
      this.ensureSpace(24);
      const top = this.doc.y;
      this.doc
        .font(FONT.regular)
        .fontSize(10)
        .fillColor(COLOR.text)
        .text("•", MARGIN + 8, top, { lineBreak: false });
      // Reset so the item starts on the bullet's line and wraps with a hanging indent.
      this.doc.y = top;
      this.text(item, { indent: 18 });
    }
  }

  private labelled(label: string, value: string): void {
    this.ensureSpace(20);
    const top = this.doc.y;
    this.doc
      .font(FONT.regular)
      .fontSize(10)
      .fillColor(COLOR.muted)
      .text(toPdfText(label), MARGIN, top, { width: 150 });
    this.doc
      .fillColor(COLOR.text)
      .text(toPdfText(value), MARGIN + 160, top, { width: this.width - 160 });
    this.gap(3);
  }

  private box(title: string, body: string | null): void {
    const pad = 10;
    const inner = this.width - pad * 2;
    const safeTitle = toPdfText(title);
    const safeBody = body === null ? null : toPdfText(body);

    const titleHeight = this.doc
      .font(FONT.bold)
      .fontSize(11)
      .heightOfString(safeTitle, { width: inner });
    const bodyHeight =
      safeBody === null
        ? 0
        : this.doc.font(FONT.regular).fontSize(9.5).heightOfString(safeBody, { width: inner }) + 4;
    const height = titleHeight + bodyHeight + pad * 2;

    this.ensureSpace(height + 8);
    const top = this.doc.y;
    this.doc
      .rect(MARGIN, top, this.width, height)
      .lineWidth(1)
      .fillAndStroke(COLOR.bannerFill, COLOR.bannerBorder);
    this.doc
      .font(FONT.bold)
      .fontSize(11)
      .fillColor(COLOR.bannerText)
      .text(safeTitle, MARGIN + pad, top + pad, { width: inner });
    if (safeBody !== null) {
      this.doc
        .font(FONT.regular)
        .fontSize(9.5)
        .text(safeBody, MARGIN + pad, top + pad + titleHeight + 4, { width: inner });
    }
    this.doc.y = top + height + 10;
  }

  header(model: ReportModel): void {
    this.text(model.title, { font: FONT.bold, size: 20, gap: 6 });
    this.text(model.orgName, { size: 12, gap: 2 });
    this.text(model.period, { size: 11, color: COLOR.muted, gap: 2 });
    if (model.generatedAt) {
      this.text(`Generated ${model.generatedAt.slice(0, 10)}`, {
        size: 9,
        color: COLOR.muted,
        gap: 2,
      });
    }
    if (model.readinessStatus) {
      this.text(`Diagnostic readiness: ${model.readinessStatus}`, {
        size: 9,
        color: COLOR.muted,
        gap: 2,
      });
    }
    this.gap(10);
  }

  nonVerifiedBanner(): void {
    this.box(
      NON_VERIFIED_BANNER,
      "This report has not been verified for publication. Limitations are listed first; read them before relying on any figure.",
    );
  }

  limitations(model: ReportModel): void {
    this.heading("Limitations");
    if (model.score.limitations.length === 0) {
      this.text("No limitations were recorded with the score.", { color: COLOR.muted });
      return;
    }
    this.bullets(model.score.limitations);
  }

  score(model: ReportModel): void {
    this.heading("Overall score");
    if (model.score.overall === null) {
      this.text("Not scored", { font: FONT.bold, size: 16 });
    } else {
      this.text(`${model.score.overall} / 100`, { font: FONT.bold, size: 22 });
    }
    this.labelled("Score status", model.score.status);
  }

  quality(model: ReportModel): void {
    const unavailable = "Not available";
    this.heading("Data quality");
    this.labelled("Completeness", model.quality.completeness ?? unavailable);
    this.labelled("Consistency", model.quality.consistency ?? unavailable);
    this.labelled("Evidence reliability", model.quality.evidenceReliability ?? unavailable);
    this.labelled("Diagnostic coverage", model.quality.diagnosticCoverage ?? unavailable);
  }

  metrics(model: ReportModel): void {
    this.heading("Metrics");
    if (model.metrics.length === 0) {
      this.text("No metrics are available.", { color: COLOR.muted });
      return;
    }

    const columns = [
      { title: "Metric", x: MARGIN, width: 190, align: "left" },
      { title: "Value", x: MARGIN + 200, width: 90, align: "right" },
      { title: "Unit", x: MARGIN + 305, width: 55, align: "left" },
      // Wide enough for the longest status, INSUFFICIENT_INPUTS, on one line.
      { title: "Status", x: MARGIN + 370, width: this.width - 370, align: "left" },
    ] as const;

    const drawHeader = (): void => {
      const top = this.doc.y;
      this.doc.font(FONT.bold).fontSize(9).fillColor(COLOR.muted);
      for (const column of columns) {
        this.doc.text(column.title, column.x, top, { width: column.width, align: column.align });
      }
      this.doc.y = top + 14;
      this.rule();
      this.gap(5);
    };

    drawHeader();
    for (const metric of model.metrics) {
      const detail = toPdfText(
        metric.periodLabel && metric.periodLabel !== model.period
          ? `${metric.code} · ${metric.periodLabel}`
          : metric.code,
      );
      const cells = [
        toPdfText(metric.label),
        toPdfText(formatMetricValue(metric)),
        toPdfText(formatUnit(metric, model.currency)),
        toPdfText(metric.status),
      ];
      // A figure is never broken across lines: long amounts are set smaller
      // instead, so "-123,456,789,012.34" cannot read as two numbers.
      const sizes = [
        ROW_FONT_SIZE,
        this.fitSize(cells[1] ?? "", columns[1].width),
        ROW_FONT_SIZE,
        ROW_FONT_SIZE,
      ];

      this.doc.font(FONT.regular);
      const heights = columns.map((column, i) =>
        this.doc
          .fontSize(sizes[i] ?? ROW_FONT_SIZE)
          .heightOfString(cells[i] ?? "", { width: column.width }),
      );
      const labelHeight = heights[0] ?? 0;
      const otherHeight = Math.max(...heights.slice(1));
      this.doc.fontSize(8);
      const detailHeight = this.doc.heightOfString(detail, { width: columns[0].width });
      const rowHeight = Math.max(labelHeight + detailHeight + 1, otherHeight) + 7;

      if (this.doc.y + rowHeight > this.bottom) {
        this.doc.addPage();
        drawHeader();
      }

      const top = this.doc.y;
      this.doc.font(FONT.regular).fillColor(COLOR.text);
      columns.forEach((column, i) => {
        const size = sizes[i] ?? ROW_FONT_SIZE;
        // Smaller text is lowered so every cell in the row shares a baseline.
        const offset = (ROW_FONT_SIZE - size) * HELVETICA_ASCENT;
        this.doc
          .fontSize(size)
          .text(cells[i] ?? "", column.x, top + offset, { width: column.width, align: column.align });
      });
      this.doc
        .fontSize(8)
        .fillColor(COLOR.muted)
        .text(detail, columns[0].x, top + labelHeight + 1, { width: columns[0].width });
      this.doc.y = top + rowHeight;
    }
  }

  findings(model: ReportModel): void {
    this.heading("Findings");
    if (model.findings.length === 0) {
      this.text("No findings were raised.", { color: COLOR.muted });
      return;
    }
    for (const finding of model.findings) {
      this.ensureSpace(70);
      this.text(`${finding.severity} · ${finding.category}`, {
        font: FONT.bold,
        size: 8,
        color: COLOR.muted,
        gap: 1,
      });
      this.text(finding.title, { font: FONT.bold, size: 10.5, gap: 2 });
      if (finding.explanation) this.text(finding.explanation, { gap: 2 });
      if (finding.implication) this.text(`Implication: ${finding.implication}`, { gap: 2 });
      if (finding.suggestedAction) {
        this.text(`Suggested action: ${finding.suggestedAction}`, { gap: 2 });
      }
      this.gap(8);
    }
  }

  interpretation(narrative: ReportAiNarrative): void {
    this.heading("Interpretation");
    if (narrative.isSimulated) {
      this.box(SIMULATED_AI_LABEL, null);
    } else {
      const source = [narrative.provider, narrative.model].filter(Boolean).join(" / ");
      this.text(source ? `${LIVE_AI_LABEL} (${source})` : LIVE_AI_LABEL, {
        font: FONT.bold,
        size: 9,
        color: COLOR.muted,
        gap: 6,
      });
    }
    this.text(narrative.summary, { gap: 6 });

    const sections = [
      ["Key observations", narrative.keyObservations],
      ["Risks", narrative.risks],
      ["Interpretation limitations", narrative.limitations],
    ] as const;
    for (const [title, items] of sections) {
      if (items.length === 0) continue;
      this.subheading(title);
      this.bullets(items);
    }
  }

  disclosures(model: ReportModel): void {
    this.heading("Disclosures");
    if (model.disclosures.length === 0) {
      this.text("No disclosures were supplied for this report.", { color: COLOR.muted });
      return;
    }
    this.bullets(model.disclosures);
  }

  /** Stamps every page with the standing disclosure and "Page X of Y". */
  footers(model: ReportModel): void {
    const range = this.doc.bufferedPageRange();
    const note = model.verifiedPublication
      ? FOOTER_DISCLOSURE
      : `${NON_VERIFIED_BANNER}. ${FOOTER_DISCLOSURE}`;

    for (let index = 0; index < range.count; index += 1) {
      this.doc.switchToPage(range.start + index);
      // Text placed below the bottom margin would otherwise start a new page.
      this.doc.page.margins.bottom = 0;
      const top = this.doc.page.height - FOOTER_OFFSET;

      this.doc
        .moveTo(MARGIN, top - 6)
        .lineTo(MARGIN + this.width, top - 6)
        .lineWidth(0.5)
        .strokeColor(COLOR.rule)
        .stroke();
      this.doc
        .font(FONT.regular)
        .fontSize(8)
        .fillColor(COLOR.muted)
        .text(toPdfText(note), MARGIN, top, { width: this.width - 90, lineBreak: false });
      this.doc.text(`Page ${index + 1} of ${range.count}`, MARGIN + this.width - 90, top, {
        width: 90,
        align: "right",
        lineBreak: false,
      });
    }
  }
}

function creationDate(model: ReportModel): Date | undefined {
  if (!model.generatedAt) return undefined;
  const date = new Date(model.generatedAt);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Renders the report as a text-only A4 PDF. Every figure and sentence comes
 * from the model; no charts or derived values are drawn.
 *
 * Section order puts limitations directly under the banner when the report
 * is not verified for publication, and after data quality when it is.
 */
export function renderReportPdf(model: ReportModel): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const created = creationDate(model);
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: MARGIN, bottom: BOTTOM_MARGIN, left: MARGIN, right: MARGIN },
        bufferPages: true,
        info: {
          Title: toPdfText(model.title),
          Author: "Opero",
          Subject: toPdfText(`${model.orgName} — ${model.period}`),
          ...(created ? { CreationDate: created } : {}),
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const writer = new ReportWriter(doc);
      writer.header(model);
      if (!model.verifiedPublication) {
        writer.nonVerifiedBanner();
        writer.limitations(model);
      }
      writer.score(model);
      writer.quality(model);
      if (model.verifiedPublication) writer.limitations(model);
      writer.metrics(model);
      writer.findings(model);
      if (model.aiNarrative) writer.interpretation(model.aiNarrative);
      writer.disclosures(model);
      writer.footers(model);

      doc.end();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
