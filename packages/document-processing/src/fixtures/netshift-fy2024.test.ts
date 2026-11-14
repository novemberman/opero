import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractFromCsv } from "../extract/csv.js";
import {
  applyUnitScale,
  interpretExtractedLine,
  resolveActualMonetaryValue,
} from "../interpret-line.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("Netshift Digital Ltd FY2024 monetary normalization regression", () => {
  const buffer = readFileSync(join(here, "netshift-fy2024.csv"));
  const result = extractFromCsv(buffer, "netshift-fy2024");
  const statement = result.statements[0]!;

  it("maps prose Revenue of label to REVENUE with NGN thousands scale", () => {
    expect(statement.currency).toBe("NGN");
    expect(statement.unitScale).toBe("THOUSANDS");
    expect(statement.unitScaleRequiresReview).toBe(false);

    const revenue = statement.lines.find((l) => l.labelRaw === "Revenue of");
    expect(revenue).toBeTruthy();
    expect(revenue!.concept).toBe("REVENUE");
    expect(revenue!.quantityClass).toBe("MONETARY");
    expect(revenue!.rawValue).toBe("144,000");
    // Contract: normalizedValue is statement units; scale applied separately.
    expect(revenue!.normalizedValue).toBe("144000");
    expect(revenue!.unitScale).toBe("THOUSANDS");
    expect(applyUnitScale(revenue!.normalizedValue, revenue!.unitScale)).toBe("144000000");
    expect(
      resolveActualMonetaryValue({
        normalizedValue: revenue!.normalizedValue,
        unitScale: revenue!.unitScale,
        quantityClass: revenue!.quantityClass,
      }),
    ).toBe("144000000");
  });

  it("keeps percentages and ratios unscaled", () => {
    const margin = statement.lines.find((l) => /gross margin/i.test(l.labelRaw));
    expect(margin!.quantityClass).toBe("PERCENTAGE");
    expect(margin!.concept).toBe("UNMAPPED");
    expect(margin!.unitScale).toBe("ACTUAL");
    expect(
      resolveActualMonetaryValue({
        normalizedValue: margin!.normalizedValue,
        unitScale: statement.unitScale,
        quantityClass: margin!.quantityClass,
      }),
    ).toBeNull();

    const ratio = statement.lines.find((l) => /current ratio/i.test(l.labelRaw));
    expect(ratio!.quantityClass).toBe("RATIO");
    expect(ratio!.unitScale).toBe("ACTUAL");
  });
});

describe("monetary scale contract unit cases", () => {
  it("scales thousands, millions, and unscaled amounts consistently", () => {
    expect(applyUnitScale("144000", "THOUSANDS")).toBe("144000000");
    expect(applyUnitScale("12.5", "MILLIONS")).toBe("12500000");
    expect(applyUnitScale("2500", "ACTUAL")).toBe("2500");
  });

  it("does not apply monetary multipliers to percentages", () => {
    const interpreted = interpretExtractedLine({
      labelRaw: "Gross margin",
      rawValue: "60.0%",
      documentUnitScale: "THOUSANDS",
      documentScaleConfidence: "HIGH",
      documentScaleRequiresReview: false,
    });
    expect(interpreted.quantityClass).toBe("PERCENTAGE");
    expect(interpreted.unitScale).toBe("ACTUAL");
    expect(interpreted.concept).toBe("UNMAPPED");
    expect(
      resolveActualMonetaryValue({
        normalizedValue: interpreted.normalizedValue,
        unitScale: "THOUSANDS",
        quantityClass: interpreted.quantityClass,
      }),
    ).toBeNull();
  });

  it("requires review when document scale is ambiguous", () => {
    const interpreted = interpretExtractedLine({
      labelRaw: "Revenue of",
      rawValue: "144,000",
      documentUnitScale: "ACTUAL",
      documentScaleConfidence: "AMBIGUOUS",
      documentScaleRequiresReview: true,
    });
    expect(interpreted.concept).toBe("REVENUE");
    expect(interpreted.unitScaleRequiresReview).toBe(true);
    expect(interpreted.quality).toBe("LOW");
    expect(interpreted.normalizedValue).toBe("144000");
    expect(applyUnitScale(interpreted.normalizedValue, interpreted.unitScale)).toBe("144000");
  });
});
