import { describe, expect, it } from "vitest";
import { mapLabelToConcept } from "./concepts.js";
import {
  classifyExtractionNoise,
  demoteExplanatoryMappedDuplicates,
  isExplanatoryProseLabel,
} from "./extraction-hygiene.js";
import { interpretExtractedLine } from "./interpret-line.js";
import { classifyQuantity } from "./quantity-class.js";

/** Exact B2 evidence labels (rows 1–28) for future-extraction hygiene regression. */
const B2_UNMAPPED = [
  { n: 1, label: "Current tax payable", raw: "4,000" },
  { n: 2, label: "Income tax expense", raw: "(6,000)" },
  { n: 3, label: "net", raw: "85,000" },
  { n: 4, label: "NGN THOUSANDS Page", raw: "1" },
  { n: 5, label: "Profit before tax", raw: "24,000" },
  { n: 6, label: "Retained earnings", raw: "25,000" },
  { n: 7, label: "Share capital", raw: "45,000" },
  { n: 8, label: "Total liabilities and equity", raw: "140,000" },
  { n: 9, label: "Closing cash and cash equivalents", raw: "25,000" },
  { n: 10, label: "equal liabilities of", raw: "70,000" },
  { n: 11, label: "equals closing cash of", raw: "25,000" },
  { n: 12, label: "Increase in inventory", raw: "(2,000)" },
  { n: 13, label: "Increase in trade payables", raw: "5,000" },
  { n: 14, label: "Increase in trade receivables", raw: "(4,000)" },
  { n: 15, label: "Net cash used in financing activities", raw: "(4,000)" },
  { n: 16, label: "Net cash used in investing activities", raw: "(15,000)" },
  { n: 17, label: "Net change in cash", raw: "7,000" },
  { n: 18, label: "Net repayment of borrowings", raw: "(4,000)" },
  { n: 19, label: "NGN THOUSANDS Page", raw: "3" },
  { n: 20, label: "Notes to the synthetic statements", raw: "1" },
  { n: 21, label: "Opening cash and cash equivalents", raw: "18,000" },
  { n: 22, label: "Opening cash of", raw: "18,000" },
  { n: 23, label: "plant and equipment", raw: "(15,000)" },
  { n: 24, label: "plus equity of", raw: "70,000" },
  { n: 25, label: "plus net cash movement of", raw: "7,000" },
  { n: 26, label: "represents NGN", raw: "144,000,000" },
  { n: 27, label: "Revenue of", raw: "144,000" },
  { n: 28, label: "Total assets of", raw: "140,000" },
] as const;

const NOISE_ROWS = new Set([4, 10, 19, 20, 24, 26]);
const NARRATIVE_DUP_NOISE_ROWS = new Set([11, 22, 25]); // connective / truncated cash fragments

function interpret(label: string, raw: string) {
  return interpretExtractedLine({
    labelRaw: label,
    rawValue: raw,
    documentUnitScale: "THOUSANDS",
    documentScaleConfidence: "MEDIUM",
    documentScaleRequiresReview: false,
  });
}

describe("B2.1 extraction hygiene — noise suppression", () => {
  it("suppresses the six verified noise patterns without monetary false negatives on statement lines", () => {
    for (const row of B2_UNMAPPED) {
      const q = classifyQuantity({ label: row.label, rawValue: row.raw });
      if (NOISE_ROWS.has(row.n) || NARRATIVE_DUP_NOISE_ROWS.has(row.n)) {
        expect(q.quantityClass, `#${row.n} ${row.label}`).not.toBe("MONETARY");
        expect(classifyExtractionNoise({ label: row.label, rawValue: row.raw })).toBeTruthy();
      }
    }

    // Legitimate statement lines must remain monetary candidates.
    for (const row of B2_UNMAPPED.filter(
      (r) => !NOISE_ROWS.has(r.n) && !NARRATIVE_DUP_NOISE_ROWS.has(r.n),
    )) {
      // #27/#28 are prose "of" labels — still monetary until duplicate demotion.
      expect(classifyQuantity({ label: row.label, rawValue: row.raw }).quantityClass).toBe(
        "MONETARY",
      );
    }

    expect(classifyQuantity({ label: "Revenue", rawValue: "144,000" }).quantityClass).toBe(
      "MONETARY",
    );
    expect(classifyQuantity({ label: "Total assets", rawValue: "140,000" }).quantityClass).toBe(
      "MONETARY",
    );
    expect(
      classifyQuantity({ label: "Cash and cash equivalents", rawValue: "25,000" }).quantityClass,
    ).toBe("MONETARY");
  });

  it("does not treat year-only or comparative-style headers as noise via these rules", () => {
    expect(classifyExtractionNoise({ label: "Revenue", rawValue: "2023" })).toBeNull();
    expect(classifyQuantity({ label: "Year ended 31 December 2024", rawValue: "2024" }).quantityClass).toBe(
      "DATE",
    );
    // Comparative twin with a real label stays monetary at classification time.
    expect(classifyQuantity({ label: "Revenue", rawValue: "120,000" }).quantityClass).toBe(
      "MONETARY",
    );
  });
});

describe("B2.1 extraction hygiene — safe alias", () => {
  it("maps Closing cash and cash equivalents to CASH_AND_EQUIVALENTS only", () => {
    expect(mapLabelToConcept("Closing cash and cash equivalents")).toBe("CASH_AND_EQUIVALENTS");
    expect(mapLabelToConcept("Closing cash")).toBe("CASH_AND_EQUIVALENTS");
    expect(mapLabelToConcept("Opening cash and cash equivalents")).toBe(
      "OPENING_CASH_AND_EQUIVALENTS",
    );
    expect(mapLabelToConcept("Profit before tax")).toBe("PROFIT_BEFORE_TAX");
    expect(mapLabelToConcept("Total")).toBe("UNMAPPED");
    expect(mapLabelToConcept("Assets")).toBe("UNMAPPED");

    const closing = interpret("Closing cash and cash equivalents", "25,000");
    expect(closing.concept).toBe("CASH_AND_EQUIVALENTS");
    expect(closing.quantityClass).toBe("MONETARY");
    expect(closing.unitScaleRequiresReview).toBe(false);
    expect(closing.scaleConfidence).toBe("MEDIUM");
  });
});

describe("B2.2 Increment A — approved concept mappings from B2 evidence", () => {
  it("maps the six approved concepts from evidence labels", () => {
    expect(interpret("Profit before tax", "24,000").concept).toBe("PROFIT_BEFORE_TAX");
    expect(interpret("Income tax expense", "(6,000)").concept).toBe("INCOME_TAX_EXPENSE");
    expect(interpret("Opening cash and cash equivalents", "18,000").concept).toBe(
      "OPENING_CASH_AND_EQUIVALENTS",
    );
    expect(interpret("Net cash used in investing activities", "(15,000)").concept).toBe(
      "INVESTING_CASH_FLOW",
    );
    expect(interpret("Net cash used in financing activities", "(4,000)").concept).toBe(
      "FINANCING_CASH_FLOW",
    );
    expect(interpret("Net change in cash", "7,000").concept).toBe("NET_CHANGE_IN_CASH");
  });

  it("keeps new mappings monetary and does not auto-confirm amounts", () => {
    const pbt = interpret("Profit before tax", "24,000");
    expect(pbt.quantityClass).toBe("MONETARY");
    expect(pbt.rawValue).toBe("24,000");
    expect(pbt.normalizedValue).toBe("24000");
    // interpretExtractedLine has no reviewStatus — persistence defaults to PENDING.
    expect(pbt.concept).not.toBe("NET_PROFIT");
  });
});

describe("B2.2 Increment B1 — BS/equity/tax liability mappings from B2 evidence", () => {
  it("maps the four approved concepts from evidence labels", () => {
    expect(interpret("Current tax payable", "4,000").concept).toBe("TAX_PAYABLE");
    expect(interpret("Retained earnings", "25,000").concept).toBe("RETAINED_EARNINGS");
    expect(interpret("Share capital", "45,000").concept).toBe("SHARE_CAPITAL");
    expect(interpret("Total liabilities and equity", "140,000").concept).toBe(
      "TOTAL_LIABILITIES_AND_EQUITY",
    );
  });

  it("keeps new mappings monetary without collapsing accounting distinctions", () => {
    const tax = interpret("Current tax payable", "4,000");
    expect(tax.quantityClass).toBe("MONETARY");
    expect(tax.rawValue).toBe("4,000");
    expect(tax.concept).not.toBe("INCOME_TAX_EXPENSE");
    expect(tax.concept).not.toBe("ACCOUNTS_PAYABLE");

    const sc = interpret("Share capital", "45,000");
    expect(sc.concept).not.toBe("EQUITY");

    const re = interpret("Retained earnings", "25,000");
    expect(re.concept).not.toBe("NET_PROFIT");

    const le = interpret("Total liabilities and equity", "140,000");
    expect(le.concept).not.toBe("TOTAL_ASSETS");
    // interpretExtractedLine has no reviewStatus — persistence defaults to PENDING.
  });
});

describe("B2.1 extraction hygiene — deferred unsupported remain unmapped", () => {
  it("keeps deferred / ambiguous B2 labels unmapped", () => {
    // A mapped #2,#5,#15–17,#21; B1 mapped #1,#6,#7,#8 — WC/debt/ambiguous stay UNMAPPED.
    const deferred = [12, 13, 14, 18, 3, 23];
    for (const n of deferred) {
      const row = B2_UNMAPPED.find((r) => r.n === n)!;
      const interpreted = interpret(row.label, row.raw);
      if (NOISE_ROWS.has(n) || NARRATIVE_DUP_NOISE_ROWS.has(n)) continue;
      expect(interpreted.concept, `#${n}`).toBe("UNMAPPED");
      expect(interpreted.quantityClass, `#${n}`).toBe("MONETARY");
    }
  });
});

describe("B2.1 extraction hygiene — duplicate handling", () => {
  it("demotes explanatory prose restatements when a clean same-concept value already exists", () => {
    const lines = [
      {
        labelRaw: "Revenue",
        concept: "REVENUE",
        normalizedValue: "144000",
        quantityClass: "MONETARY",
      },
      {
        labelRaw: "Revenue of",
        concept: "REVENUE",
        normalizedValue: "144000",
        quantityClass: "MONETARY",
      },
      {
        labelRaw: "Total assets",
        concept: "TOTAL_ASSETS",
        normalizedValue: "140000",
        quantityClass: "MONETARY",
      },
      {
        labelRaw: "Total assets of",
        concept: "TOTAL_ASSETS",
        normalizedValue: "140000",
        quantityClass: "MONETARY",
      },
    ];

    const { lines: out, demotedIndexes } = demoteExplanatoryMappedDuplicates(lines);
    expect(demotedIndexes).toEqual([1, 3]);
    expect(out[0]?.quantityClass).toBe("MONETARY");
    expect(out[0]?.concept).toBe("REVENUE");
    expect(out[1]?.quantityClass).toBe("OTHER");
    expect(out[1]?.concept).toBe("UNMAPPED");
    expect(out[2]?.concept).toBe("TOTAL_ASSETS");
    expect(out[3]?.quantityClass).toBe("OTHER");
  });

  it("retains legitimate repeated disclosures with clean labels", () => {
    const lines = [
      {
        labelRaw: "Revenue",
        concept: "REVENUE",
        normalizedValue: "144000",
        quantityClass: "MONETARY",
      },
      {
        labelRaw: "Revenue",
        concept: "REVENUE",
        normalizedValue: "144000",
        quantityClass: "MONETARY",
      },
    ];
    const { demotedIndexes, lines: out } = demoteExplanatoryMappedDuplicates(lines);
    expect(demotedIndexes).toEqual([]);
    expect(out.every((l) => l.quantityClass === "MONETARY" && l.concept === "REVENUE")).toBe(true);
  });

  it("does not demote identical amounts across different concepts", () => {
    const lines = [
      {
        labelRaw: "Total equity",
        concept: "EQUITY",
        normalizedValue: "70000",
        quantityClass: "MONETARY",
      },
      {
        labelRaw: "Total liabilities",
        concept: "TOTAL_LIABILITIES",
        normalizedValue: "70000",
        quantityClass: "MONETARY",
      },
    ];
    const { demotedIndexes } = demoteExplanatoryMappedDuplicates(lines);
    expect(demotedIndexes).toEqual([]);
  });

  it("keeps sole Revenue of as a mapped monetary line (CSV fixture path)", () => {
    const only = [
      {
        labelRaw: "Revenue of",
        concept: "REVENUE",
        normalizedValue: "144000",
        quantityClass: "MONETARY",
      },
    ];
    const { demotedIndexes, lines: out } = demoteExplanatoryMappedDuplicates(only);
    expect(demotedIndexes).toEqual([]);
    expect(out[0]?.concept).toBe("REVENUE");
    expect(isExplanatoryProseLabel("Revenue of")).toBe(true);
  });
});

describe("B2.1 before/after fixture counts", () => {
  it("reduces unmapped monetary noise for the B2 label set when statement anchors exist", () => {
    const statementAnchors = [
      { labelRaw: "Revenue", rawValue: "144,000" },
      { labelRaw: "Total assets", rawValue: "140,000" },
      { labelRaw: "Cash and cash equivalents", rawValue: "25,000" },
    ];

    const before = [...statementAnchors, ...B2_UNMAPPED.map((r) => ({ labelRaw: r.label, rawValue: r.raw }))].map(
      (r) => {
        // Pre-hygiene baseline: quantity class without noise rules is approximated by
        // interpreting after the fact — use raw classify path for after only.
        const interpreted = interpret(r.labelRaw, r.rawValue);
        return {
          labelRaw: r.labelRaw,
          concept: interpreted.concept,
          normalizedValue: interpreted.normalizedValue,
          quantityClass: interpreted.quantityClass,
        };
      },
    );

    // "Before" for this fixture = treat noise rows as if they were still MONETARY UNMAPPED.
    const beforeUnmappedMonetary = B2_UNMAPPED.length; // 28 staging unmapped monetary
    expect(beforeUnmappedMonetary).toBe(28);

    const afterInterpreted = B2_UNMAPPED.map((r) => {
      const interpreted = interpret(r.label, r.raw);
      return {
        labelRaw: r.label,
        concept: interpreted.concept,
        normalizedValue: interpreted.normalizedValue,
        quantityClass: interpreted.quantityClass,
      };
    });

    // Attach statement anchors then demote explanatory duplicates (#27/#28).
    const withAnchors = [
      ...statementAnchors.map((r) => {
        const interpreted = interpret(r.labelRaw, r.rawValue);
        return {
          labelRaw: r.labelRaw,
          concept: interpreted.concept,
          normalizedValue: interpreted.normalizedValue,
          quantityClass: interpreted.quantityClass,
        };
      }),
      ...afterInterpreted,
    ];
    const { lines: after } = demoteExplanatoryMappedDuplicates(withAnchors);

    const afterUnmappedMonetary = after.filter(
      (l) => l.quantityClass === "MONETARY" && l.concept === "UNMAPPED",
    ).length;
    const afterMappedMonetary = after.filter(
      (l) => l.quantityClass === "MONETARY" && l.concept !== "UNMAPPED",
    ).length;
    const afterContextual = after.filter((l) => l.quantityClass !== "MONETARY").length;

    // Noise (6) + narrative (3) contextual; #9 closing + Increment A (#2,#5,#15–17,#21)
    // + Increment B1 (#1,#6,#7,#8) map; #27/#28 demoted.
    // Remaining unmapped monetary: WC/debt deferred (4) + ambiguous (2) = 6.
    expect(afterUnmappedMonetary).toBe(6);
    expect(afterMappedMonetary).toBeGreaterThanOrEqual(14); // anchors + closing + A + B1
    expect(afterContextual).toBeGreaterThanOrEqual(9); // 6 noise + 3 narrative (+ demoted)

    // Scale axes remain distinct on the safe alias line.
    const closing = interpret("Closing cash and cash equivalents", "25,000");
    expect(closing.unitScaleRequiresReview).toBe(false);
    expect(closing.scaleConfidence).toBe("MEDIUM");

    // Percentages never become monetary.
    expect(interpret("Gross margin", "58.3%").quantityClass).toBe("PERCENTAGE");
    expect(interpret("Gross margin", "58.3%").concept).toBe("UNMAPPED");

    void before;
  });
});
