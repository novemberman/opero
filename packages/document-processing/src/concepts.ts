export const FINANCIAL_CONCEPTS = [
  "REVENUE",
  "COST_OF_GOODS_SOLD",
  "GROSS_PROFIT",
  "OPERATING_EXPENSES",
  "OPERATING_PROFIT",
  "NET_PROFIT",
  "CASH_AND_EQUIVALENTS",
  "ACCOUNTS_RECEIVABLE",
  "ACCOUNTS_PAYABLE",
  "CURRENT_ASSETS",
  "CURRENT_LIABILITIES",
  "TOTAL_ASSETS",
  "TOTAL_LIABILITIES",
  "EQUITY",
  "OPERATING_CASH_FLOW",
  "UNMAPPED",
] as const;

export type FinancialConceptId = (typeof FINANCIAL_CONCEPTS)[number];

const LABEL_MAP: Array<{ concept: FinancialConceptId; patterns: RegExp[] }> = [
  {
    concept: "REVENUE",
    patterns: [/^total\s+revenue$/i, /^revenue$/i, /^net\s+sales$/i, /^sales$/i],
  },
  {
    concept: "COST_OF_GOODS_SOLD",
    patterns: [/^cost of (goods|sales)/i, /^cogs$/i],
  },
  {
    concept: "GROSS_PROFIT",
    patterns: [/^gross\s+profit$/i, /^gross\s+margin$/i],
  },
  {
    concept: "OPERATING_EXPENSES",
    patterns: [/^operating\s+expenses?$/i, /^opex$/i, /^total\s+operating\s+expenses?$/i],
  },
  {
    concept: "OPERATING_PROFIT",
    patterns: [/^operating\s+(profit|income)$/i, /^income\s+from\s+operations$/i, /^ebit$/i],
  },
  {
    concept: "NET_PROFIT",
    patterns: [/^net\s+(profit|income|earnings)$/i, /^profit\s+for\s+the\s+(year|period)$/i],
  },
  {
    concept: "CASH_AND_EQUIVALENTS",
    patterns: [/^cash(\s+and\s+cash\s+equivalents)?$/i],
  },
  {
    concept: "ACCOUNTS_RECEIVABLE",
    patterns: [/^accounts?\s+receivable$/i, /^trade\s+receivables?$/i],
  },
  {
    concept: "ACCOUNTS_PAYABLE",
    patterns: [/^accounts?\s+payable$/i, /^trade\s+payables?$/i],
  },
  {
    concept: "CURRENT_ASSETS",
    patterns: [/^current\s+assets$/i, /^total\s+current\s+assets$/i],
  },
  {
    concept: "CURRENT_LIABILITIES",
    patterns: [/^current\s+liabilities$/i, /^total\s+current\s+liabilities$/i],
  },
  {
    concept: "TOTAL_ASSETS",
    patterns: [/^total\s+assets$/i],
  },
  {
    concept: "TOTAL_LIABILITIES",
    patterns: [/^total\s+liabilities$/i],
  },
  {
    concept: "EQUITY",
    patterns: [
      /^total\s+(equity|shareholders['’]?\s+equity|stockholders['’]?\s+equity)$/i,
      /^equity$/i,
    ],
  },
  {
    concept: "OPERATING_CASH_FLOW",
    patterns: [
      /^net\s+cash\s+(from|provided by)\s+operating/i,
      /^cash\s+from\s+operations$/i,
      /^operating\s+cash\s+flow$/i,
    ],
  },
];

export function mapLabelToConcept(label: string): FinancialConceptId {
  const normalized = label.replace(/\s+/g, " ").trim();
  for (const entry of LABEL_MAP) {
    if (entry.patterns.some((pattern) => pattern.test(normalized))) {
      return entry.concept;
    }
  }
  return "UNMAPPED";
}
