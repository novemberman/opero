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
  "INVENTORY",
  "CURRENT_ASSETS",
  "CURRENT_LIABILITIES",
  "TOTAL_ASSETS",
  "TOTAL_LIABILITIES",
  "EQUITY",
  "INTEREST_BEARING_DEBT",
  "INTEREST_EXPENSE",
  "OPERATING_CASH_FLOW",
  "CAPITAL_EXPENDITURE",
  "UNMAPPED",
] as const;

export type FinancialConceptId = (typeof FINANCIAL_CONCEPTS)[number];

/**
 * Ordered most-specific first. Do not map percentage "margin" labels to
 * absolute profit concepts — quantity classification should exclude them first.
 */
const LABEL_MAP: Array<{ concept: FinancialConceptId; patterns: RegExp[] }> = [
  {
    concept: "REVENUE",
    patterns: [
      /^total\s+(revenue|turnover|sales)$/i,
      // Matches bare "Revenue" and prose fragments after canonicalizeLabel ("Revenue of").
      /^(revenue|turnover|net\s+sales|sales)$/i,
    ],
  },
  {
    concept: "COST_OF_GOODS_SOLD",
    patterns: [/^cost of (goods\s+sold|sales)$/i, /^cogs$/i, /^cost\s+of\s+sales$/i],
  },
  {
    concept: "GROSS_PROFIT",
    // Gross margin (percentage) is intentionally excluded — see quantity-class.
    patterns: [/^gross\s+profit$/i, /^gross\s+income$/i],
  },
  {
    concept: "OPERATING_EXPENSES",
    patterns: [/^operating\s+expenses?$/i, /^opex$/i, /^total\s+operating\s+expenses?$/i],
  },
  {
    concept: "OPERATING_PROFIT",
    patterns: [
      /^operating\s+(profit|income)$/i,
      /^income\s+from\s+operations$/i,
      /^ebit$/i,
      /^operating\s+profit\s+before\s+interest/i,
    ],
  },
  {
    concept: "NET_PROFIT",
    patterns: [
      /^net\s+(profit|income|earnings)$/i,
      /^profit\s+after\s+tax$/i,
      /^profit\s+for\s+the\s+(year|period)$/i,
      /^pat$/i,
    ],
  },
  {
    concept: "CASH_AND_EQUIVALENTS",
    patterns: [
      /^cash(\s+and\s+cash\s+equivalents)?$/i,
      /^cash\s+and\s+equivalents$/i,
      /^cash\s+at\s+bank$/i,
      // B2.1 #9 — period-end CF closing cash equals BS cash. Do NOT map Opening cash.
      /^closing\s+cash(\s+and\s+cash\s+equivalents)?$/i,
    ],
  },
  {
    concept: "ACCOUNTS_RECEIVABLE",
    patterns: [/^accounts?\s+receivable$/i, /^trade\s+receivables?$/i, /^trade\s+and\s+other\s+receivables?$/i],
  },
  {
    concept: "ACCOUNTS_PAYABLE",
    patterns: [/^accounts?\s+payable$/i, /^trade\s+payables?$/i, /^trade\s+and\s+other\s+payables?$/i],
  },
  {
    concept: "INVENTORY",
    patterns: [/^inventory$/i, /^inventories$/i, /^stock$/i],
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
      /^net\s+assets$/i,
    ],
  },
  {
    concept: "INTEREST_BEARING_DEBT",
    patterns: [
      /^interest[- ]bearing\s+debt$/i,
      /^total\s+debt$/i,
      /^long[- ]term\s+(debt|borrowings)$/i,
      /^short[- ]term\s+(debt|borrowings)$/i,
      /^borrowings$/i,
    ],
  },
  {
    concept: "INTEREST_EXPENSE",
    patterns: [/^interest\s+expense$/i, /^finance\s+costs?$/i, /^interest\s+payable$/i],
  },
  {
    concept: "OPERATING_CASH_FLOW",
    patterns: [
      /^net\s+cash\s+(from|provided by|generated\s+from)\s+operating/i,
      /^cash\s+from\s+operations$/i,
      /^operating\s+cash\s+flow$/i,
      /^cash\s+flows?\s+from\s+operating\s+activities$/i,
    ],
  },
  {
    concept: "CAPITAL_EXPENDITURE",
    patterns: [
      /^capital\s+expenditures?$/i,
      /^capex$/i,
      /^purchases?\s+of\s+property/i,
      /^additions?\s+to\s+ppe$/i,
    ],
  },
];

/**
 * Labels that look financial but are intentionally left UNMAPPED because the
 * diagnostics engine has no dedicated concept yet (preserve distinctions).
 */
const KNOWN_UNMAPPED_DISTINCTIONS = [
  /^profit\s+before\s+tax$/i,
  /^pbt$/i,
  /^profit\s+before\s+taxation$/i,
  /^investing\s+cash\s+flow$/i,
  /^cash\s+flows?\s+from\s+investing/i,
  /^financing\s+cash\s+flow$/i,
  /^cash\s+flows?\s+from\s+financing/i,
  /^non[- ]current\s+assets$/i,
  /^total\s+non[- ]current\s+assets$/i,
  /^share\s+capital$/i,
  /^retained\s+earnings$/i,
  // Opening cash is a CF period-start balance — not interchangeable with BS cash.
  /^opening\s+cash(\s+and\s+cash\s+equivalents)?$/i,
];

/**
 * Collapse whitespace and strip trailing prose particles from PDF/text extracts
 * ("Revenue of", "Cash at", "Equity for the year") without breaking labels that
 * contain "of" mid-phrase ("Cost of sales", "Cash flows from operating activities").
 */
export function canonicalizeLabel(label: string): string {
  let normalized = label.replace(/\s+/g, " ").trim();
  normalized = normalized.replace(/\s+for the (year|period|quarter)(\s+ended.*)?$/i, "");
  normalized = normalized.replace(/\s+(of|at|as at|as of)$/i, "");
  return normalized;
}

export function mapLabelToConcept(label: string): FinancialConceptId {
  const normalized = canonicalizeLabel(label);
  for (const entry of LABEL_MAP) {
    if (entry.patterns.some((pattern) => pattern.test(normalized))) {
      return entry.concept;
    }
  }
  return "UNMAPPED";
}

export function isKnownUnmappedDistinction(label: string): boolean {
  const normalized = canonicalizeLabel(label);
  return KNOWN_UNMAPPED_DISTINCTIONS.some((pattern) => pattern.test(normalized));
}
