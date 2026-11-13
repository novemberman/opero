import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { assembleReportModel, DISCLOSURES } from "./assemble.js";
import type { ReportModel } from "./model.js";
import {
  FOOTER_DISCLOSURE,
  formatMetricValue,
  LIVE_AI_LABEL,
  NON_VERIFIED_BANNER,
  renderReportPdf,
  roundDecimalString,
  SIMULATED_AI_LABEL,
  toPdfText,
} from "./pdf.js";
import { aiNarrativeFixture, payloadFixture } from "./test-fixtures.js";

type TextItem = { str?: string };

/** Text of each page as a reader would see it, with whitespace collapsed. */
async function pageTexts(pdf: Buffer): Promise<string[]> {
  const document = await getDocument({
    data: new Uint8Array(pdf),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      (content.items as TextItem[])
        .map((item) => item.str ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  await document.destroy();
  return pages;
}

async function render(model: ReportModel): Promise<{ pdf: Buffer; pages: string[]; text: string }> {
  const pdf = await renderReportPdf(model);
  const pages = await pageTexts(pdf);
  return { pdf, pages, text: pages.join(" ") };
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

type PlacedText = { str: string; left: number; right: number; top: number; bottom: number };
type PlacedPage = { width: number; height: number; items: PlacedText[] };

/** Every non-blank text run with its box, measured from the top-left of the page. */
async function placedPages(pdf: Buffer): Promise<PlacedPage[]> {
  const document = await getDocument({
    data: new Uint8Array(pdf),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;
  const pages: PlacedPage[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const [, , width = 0, height = 0] = page.view;
    const content = await page.getTextContent();
    const items: PlacedText[] = [];
    for (const item of content.items as Array<{ str?: string; width: number; transform: number[] }>) {
      if (!item.str?.trim()) continue;
      const [, , c = 0, d = 0, x = 0, y = 0] = item.transform;
      const size = Math.hypot(c, d);
      items.push({
        str: item.str,
        left: x,
        right: x + item.width,
        top: height - y - size * 0.75,
        bottom: height - y + size * 0.25,
      });
    }
    pages.push({ width, height, items });
  }
  await document.destroy();
  return pages;
}

const PAGE_MARGIN = 50;
const FOOTER_ZONE = 72;

function isFooterText(item: PlacedText, page: PlacedPage): boolean {
  return item.top > page.height - FOOTER_ZONE;
}

/** Layout faults a reader would see: clipped, overlapping or misplaced text. */
function layoutFaults(pages: PlacedPage[]): string[] {
  const faults: string[] = [];
  pages.forEach((page, index) => {
    const where = `page ${index + 1}`;
    const body = page.items.filter((item) => !isFooterText(item, page));
    if (body.length === 0) faults.push(`${where}: no content above the footer`);

    for (const item of page.items) {
      if (item.left < PAGE_MARGIN - 1 || item.right > page.width - PAGE_MARGIN + 1) {
        faults.push(`${where}: outside the side margins: ${item.str.slice(0, 40)}`);
      }
      if (item.top < PAGE_MARGIN - 4 || item.bottom > page.height) {
        faults.push(`${where}: outside the page: ${item.str.slice(0, 40)}`);
      }
    }
    for (const item of body) {
      if (item.bottom > page.height - FOOTER_ZONE + 6) {
        faults.push(`${where}: runs into the footer: ${item.str.slice(0, 40)}`);
      }
    }
    page.items.forEach((a, i) => {
      for (const b of page.items.slice(i + 1)) {
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapX > 1 && overlapY > 2) {
          faults.push(`${where}: overlap: ${a.str.slice(0, 30)} / ${b.str.slice(0, 30)}`);
        }
      }
    });
    for (const bullet of page.items.filter((item) => item.str.trim() === "•")) {
      const hasText = page.items.some(
        (item) => item.left > bullet.right && Math.abs(item.bottom - bullet.bottom) < 1,
      );
      if (!hasText) faults.push(`${where}: bullet separated from its text`);
    }
  });
  return faults;
}

function sentences(prefix: string, chars: number): string {
  const sentence =
    "Liquidity remained under pressure because current liabilities grew faster than current assets while collections slowed. ";
  return `${prefix} ${sentence.repeat(Math.ceil(chars / sentence.length))}`.slice(0, chars - 1).trimEnd() + ".";
}

describe("renderReportPdf", () => {
  it("returns a PDF buffer", async () => {
    const pdf = await renderReportPdf(assembleReportModel(payloadFixture()));

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.subarray(-6).toString("latin1").trim()).toBe("%%EOF");
    expect(pdf.length).toBeGreaterThan(1_000);
  });

  it("prints the report identity, score, metrics and findings from the model", async () => {
    const model = assembleReportModel(payloadFixture(), {
      title: "Acme X-Ray",
      generatedAt: "2026-11-13T09:30:00.000Z",
    });

    const { text } = await render(model);

    expect(text).toContain("Acme X-Ray");
    expect(text).toContain("Acme Trading Ltd");
    expect(text).toContain("FY2025");
    expect(text).toContain("Generated 2026-11-13");
    expect(text).toContain("Diagnostic readiness: PARTIALLY_READY");
    expect(text).toContain("54 / 100");
    expect(text).toContain("Score status SCORED");
    expect(text).toContain("Diagnostic coverage 0.6");
    expect(text).toContain("Current ratio 0.8235 ratio COMPUTED");
    expect(text).toContain("Working capital -18,000 USD COMPUTED");
    expect(text).toContain("Debt to equity — ratio INSUFFICIENT_INPUTS");
    expect(text).toContain("HIGH · RISK");
    expect(text).toContain("Current liabilities exceed current assets");
    expect(text).toContain("Implication: Short-term obligations may be difficult to meet.");
    expect(text).toContain("Suggested action: Review the timing of payables and receivables.");
  });

  it("includes every disclosure", async () => {
    const model = assembleReportModel(payloadFixture(), {
      aiNarrative: aiNarrativeFixture(),
      additionalDisclosures: ["Prepared for internal review only."],
    });

    const { text } = await render(model);

    expect(model.disclosures).toHaveLength(6);
    expect(text).toContain("Disclosures");
    for (const disclosure of model.disclosures) {
      expect(text).toContain(disclosure);
    }
  });

  it("numbers every page and repeats the footer disclosure", async () => {
    const payload = payloadFixture({
      metrics: Array.from({ length: 90 }, (_, i) => ({
        code: `METRIC_${i}`,
        label: `Metric number ${i}`,
        status: "COMPUTED",
        value: String(i),
        unit: "ratio",
      })),
    });

    const { pages } = await render(assembleReportModel(payload, { verifiedPublication: true }));

    expect(pages.length).toBeGreaterThan(2);
    pages.forEach((page, index) => {
      expect(page).toContain(`Page ${index + 1} of ${pages.length}`);
      expect(count(page, "Page ")).toBe(1);
      expect(page).toContain(FOOTER_DISCLOSURE);
    });
    expect(pages.join(" ")).toContain("Metric number 89 89 ratio COMPUTED");
    for (const page of pages.slice(1, -1)) {
      expect(page).toContain("Metric Value Unit Status");
    }
  });

  it("shows the non-verified banner and puts limitations before the score", async () => {
    const { pages, text } = await render(assembleReportModel(payloadFixture()));

    expect(pages[0]).toContain(NON_VERIFIED_BANNER);
    expect(text).toContain("This report has not been verified for publication.");
    expect(text.indexOf("Limitations")).toBeLessThan(text.indexOf("Overall score"));
    expect(text.indexOf(NON_VERIFIED_BANNER)).toBeLessThan(text.indexOf("Limitations"));
    expect(text).toContain("score.v1 thresholds are provisional heuristics, not industry benchmarks");
    for (const page of pages) {
      expect(page).toContain(`${NON_VERIFIED_BANNER}. ${FOOTER_DISCLOSURE}`);
    }
  });

  it("omits the non-verified banner for a verified publication", async () => {
    const model = assembleReportModel(payloadFixture(), { verifiedPublication: true });

    const { text } = await render(model);

    expect(text).not.toContain(NON_VERIFIED_BANNER);
    expect(text).not.toContain("has not been verified");
    expect(text.indexOf("Overall score")).toBeLessThan(text.indexOf("Limitations"));
    expect(text).toContain("score.v1 thresholds are provisional heuristics, not industry benchmarks");
  });

  it("labels a simulated interpretation", async () => {
    const model = assembleReportModel(payloadFixture(), { aiNarrative: aiNarrativeFixture() });

    const { text } = await render(model);

    expect(text).toContain("Interpretation");
    expect(text).toContain(SIMULATED_AI_LABEL);
    expect(text).not.toContain(LIVE_AI_LABEL);
    expect(text.indexOf(SIMULATED_AI_LABEL)).toBeLessThan(
      text.indexOf("Liquidity is under pressure for the period."),
    );
    expect(text).toContain("Key observations");
    expect(text).toContain("Current ratio [CURRENT_RATIO] was computed as 0.8235.");
    expect(text).toContain("Current liabilities exceed current assets (HIGH).");
    expect(text).toContain("Debt to equity could not be computed.");
    expect(text).toContain(DISCLOSURES.simulatedAi);
  });

  it("labels a live interpretation as AI-generated, not simulated", async () => {
    const model = assembleReportModel(payloadFixture(), {
      aiNarrative: aiNarrativeFixture({ isSimulated: false, provider: "openai", model: "m-1" }),
    });

    const { text } = await render(model);

    expect(text).toContain(`${LIVE_AI_LABEL} (openai / m-1)`);
    expect(text).not.toContain(SIMULATED_AI_LABEL);
    expect(text).toContain(DISCLOSURES.liveAi);
  });

  it("works without an AI narrative", async () => {
    const model = assembleReportModel(payloadFixture());

    const { pdf, text } = await render(model);

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(text).not.toContain("Interpretation");
    expect(text).not.toContain(SIMULATED_AI_LABEL);
    expect(text).not.toContain(LIVE_AI_LABEL);
    expect(text).toContain("Metrics");
    expect(text).toContain("Findings");
    for (const disclosure of model.disclosures) {
      expect(text).toContain(disclosure);
    }
  });

  it("states plainly when there is no score, metric or finding", async () => {
    const model = assembleReportModel({
      metrics: [],
      findings: [],
      quality: {},
      score: { status: "INSUFFICIENT_DATA" },
    });

    const { text } = await render(model);

    expect(text).toContain("Not scored");
    expect(text).not.toContain("/ 100");
    expect(text).toContain("Score status INSUFFICIENT_DATA");
    expect(text).toContain("Completeness Not available");
    expect(text).toContain("No metrics are available.");
    expect(text).toContain("No findings were raised.");
    expect(text).toContain("No limitations were recorded with the score.");
    expect(text).toContain(DISCLOSURES.notScored);
  });

  it("prints long amounts whole, on one line, without leaving the value column", async () => {
    const amounts = [
      "-123456789012.34",
      "1234567890123.45",
      "-987654321098765.4",
      "45678901234567",
      "-18000",
    ];
    const model = assembleReportModel(
      payloadFixture({
        currency: "IDR",
        metrics: amounts.map((value, i) => ({
          code: `AMOUNT_${i}`,
          label: `Amount ${i}`,
          status: "COMPUTED",
          value,
          unit: "currency",
        })),
      }),
    );

    const pages = await placedPages(await renderReportPdf(model));
    const items = pages.flatMap((page) => page.items);

    for (const metric of model.metrics) {
      const printed = items.filter((item) => item.str.trim() === formatMetricValue(metric));
      expect(printed, formatMetricValue(metric)).toHaveLength(1);
      // The value column spans x = 250..340.
      expect(printed[0]!.left).toBeGreaterThanOrEqual(249);
      expect(printed[0]!.right).toBeLessThanOrEqual(341);
    }
    expect(items.map((item) => item.str.trim())).toContain("-123,456,789,012.34");
    expect(layoutFaults(pages)).toEqual([]);
  });

  it("lays out a narrative at the schema limits without clipping or overlap", async () => {
    const list = (prefix: string) =>
      Array.from({ length: 25 }, (_, i) => sentences(`${prefix} ${i + 1}:`, 1_500));
    const model = assembleReportModel(payloadFixture(), {
      title: "Financial X-Ray Report for the consolidated group including every subsidiary",
      aiNarrative: aiNarrativeFixture({
        isSimulated: false,
        provider: "openai",
        model: "m-1",
        narrative: {
          summary: sentences("Summary:", 4_000),
          keyObservations: list("Observation"),
          risks: list("Risk"),
          limitations: list("Limitation"),
        },
      }),
      generatedAt: "2026-11-13T09:30:00.000Z",
    });

    const pdf = await renderReportPdf(model);
    const pages = await placedPages(pdf);
    const text = (await pageTexts(pdf)).join(" ");

    expect(pages.length).toBeGreaterThan(10);
    expect(layoutFaults(pages)).toEqual([]);
    // Nothing is dropped: the first and the last item of each list are complete.
    for (const prefix of ["Observation", "Risk", "Limitation"]) {
      expect(text).toContain(`${prefix} 1: Liquidity remained under pressure`);
      expect(text).toContain(`${prefix} 25: Liquidity remained under pressure`);
    }
    expect(count(text, LIVE_AI_LABEL)).toBe(1);
    for (const disclosure of model.disclosures) {
      expect(text).toContain(disclosure);
    }
  });

  it("lays out incomplete, negative and multi-period reports without layout faults", async () => {
    const incomplete = assembleReportModel(
      payloadFixture({
        metrics: Array.from({ length: 30 }, (_, i) => ({
          code: `UNAVAILABLE_${i}`,
          label: "Operating cash flow to current liabilities",
          status: "INSUFFICIENT_INPUTS",
          value: null,
          unit: "ratio",
        })),
        score: {
          status: "INSUFFICIENT_DATA",
          overallScore: null,
          limitations: ["diagnosticCoverage 0.2 is below the minimum for scoring"],
        },
        readinessStatus: "ACTION_REQUIRED",
      }),
      { verifiedPublication: true, aiNarrative: aiNarrativeFixture() },
    );
    const negative = assembleReportModel(
      payloadFixture({
        metrics: ["-0.4521", "-1250000.5", "-36.2", "-0.0001"].map((value, i) => ({
          code: `NEGATIVE_${i}`,
          label: `Negative metric ${i}`,
          status: "COMPUTED",
          value,
          unit: i === 1 ? "currency" : "ratio",
        })),
        findings: Array.from({ length: 12 }, (_, i) => ({
          category: "RISK",
          severity: "HIGH",
          title: `Loss-making period ${i}`,
          explanation: sentences("Explanation:", 600),
          implication: sentences("Losses reduce equity.", 300),
          suggestedAction: sentences("Review the cost base.", 300),
        })),
      }),
    );
    const periods = ["FY2022", "FY2023", "FY2024", "Twelve months ended 31 December 2025 (restated)"];
    const multiPeriod = assembleReportModel(
      payloadFixture({
        periodLabel: "FY2022 to FY2025",
        metrics: periods.flatMap((periodLabel) =>
          Array.from({ length: 22 }, (_, i) => ({
            code: `METRIC_${i}`,
            label: `Metric number ${i}`,
            status: "COMPUTED",
            value: String(i * 1.5),
            unit: "ratio",
            periodLabel,
          })),
        ),
      }),
      { verifiedPublication: true },
    );

    const rendered = await render(incomplete);
    expect(rendered.pages[0]).toContain(NON_VERIFIED_BANNER);
    expect(rendered.text).toContain("Not scored");
    expect(rendered.text).not.toContain("/ 100");
    expect(rendered.text).toContain(SIMULATED_AI_LABEL);
    expect(layoutFaults(await placedPages(rendered.pdf))).toEqual([]);

    const negativeRendered = await render(negative);
    expect(negativeRendered.text).toContain("Negative metric 1 -1,250,000.5 USD COMPUTED");
    expect(negativeRendered.text).toContain("Negative metric 3 -0.0001 ratio COMPUTED");
    expect(layoutFaults(await placedPages(negativeRendered.pdf))).toEqual([]);

    const multiRendered = await render(multiPeriod);
    for (const period of periods) {
      expect(count(multiRendered.text, `METRIC_21 · ${period}`)).toBe(1);
    }
    expect(layoutFaults(await placedPages(multiRendered.pdf))).toEqual([]);
  });

  it("embeds no images", async () => {
    const pdf = await renderReportPdf(
      assembleReportModel(payloadFixture(), { aiNarrative: aiNarrativeFixture() }),
    );
    const raw = pdf.toString("latin1");

    expect(raw).not.toContain("/Subtype /Image");
    expect(raw).not.toContain("/XObject");
  });

  it("renders text the built-in fonts cannot encode as visible placeholders", async () => {
    const model = assembleReportModel(
      payloadFixture({ organizationName: "Société Générale 株式会社 – Zürich €" }),
    );

    const { text } = await render(model);

    expect(text).toContain("Société Générale ???? – Zürich €");
  });

  it("produces identical bytes for the same model when generatedAt is set", async () => {
    const model = assembleReportModel(payloadFixture(), {
      aiNarrative: aiNarrativeFixture(),
      generatedAt: "2026-11-13T09:30:00.000Z",
    });

    const first = await renderReportPdf(model);
    const second = await renderReportPdf(model);

    expect(first.equals(second)).toBe(true);
  });
});

describe("formatMetricValue", () => {
  it.each([
    [{ value: "0.8235294117647058824", unit: "ratio" }, "0.8235"],
    [{ value: "0.82355", unit: "ratio" }, "0.8236"],
    [{ value: "1.5", unit: "ratio" }, "1.5"],
    [{ value: "42", unit: "days" }, "42"],
    [{ value: "-18000", unit: "currency" }, "-18,000"],
    [{ value: "1234567.891", unit: "currency" }, "1,234,567.89"],
    [{ value: "123456789012345678901234.555", unit: "currency" }, "123,456,789,012,345,678,901,234.56"],
    [{ value: "-0.00001", unit: "ratio" }, "0"],
    [{ value: "not-a-number", unit: "ratio" }, "not-a-number"],
    [{ value: null, unit: "ratio" }, "—"],
  ])("formats %o as %s", (metric, expected) => {
    expect(formatMetricValue(metric)).toBe(expected);
  });
});

describe("roundDecimalString", () => {
  it.each([
    ["0.5", 0, "1"],
    ["-0.5", 0, "-1"],
    ["0.4999", 0, "0"],
    ["9.9999", 2, "10"],
    ["-9.995", 2, "-10"],
    ["1.005", 2, "1.01"],
    ["12", 4, "12"],
    ["+3.10", 2, "3.1"],
  ])("rounds %s to %i places as %s", (value, digits, expected) => {
    expect(roundDecimalString(value, digits)).toBe(expected);
  });

  it.each(["1e-7", "1,000", "", "abc", "1.", ".5"])("returns null for %j", (value) => {
    expect(roundDecimalString(value, 2)).toBeNull();
  });
});

describe("toPdfText", () => {
  it("keeps Windows-1252 text and replaces everything else visibly", () => {
    expect(toPdfText("Café — “quoted” • 5 € … ™")).toBe("Café — “quoted” • 5 € … ™");
    expect(toPdfText("日本 😀 Ω")).toBe("?? ? ?");
  });

  it("normalizes look-alike punctuation and strips control characters", () => {
    expect(toPdfText("a\u2212b\u00A0c\u0000d\ne\u0085f")).toBe("a-b cd ef");
    expect(toPdfText("e\u0301")).toBe("é");
  });
});
