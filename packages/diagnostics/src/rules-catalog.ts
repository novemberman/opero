import type { FindingCategory } from "./types.js";
import { RULE_SET_ID, RULE_SET_VERSION } from "./versions.js";

export type RuleCatalogEntry = {
  ruleSetId: string;
  ruleId: string;
  version: string;
  title: string;
  description: string;
  category: FindingCategory;
};

export const RULES_V1: RuleCatalogEntry[] = [
  {
    ruleSetId: RULE_SET_ID,
    ruleId: "REV_UP_MARGIN_DOWN",
    version: RULE_SET_VERSION,
    title: "Revenue rising while net margin deteriorates",
    description: "Revenue increased while net margin declined versus the prior comparable period.",
    category: "RISK",
  },
  {
    ruleSetId: RULE_SET_ID,
    ruleId: "OCF_NEG_NI_POS",
    version: RULE_SET_VERSION,
    title: "Negative operating cash flow despite positive net income",
    description: "Operating cash flow is negative while net income is positive.",
    category: "RISK",
  },
  {
    ruleSetId: RULE_SET_ID,
    ruleId: "CA_LT_CL",
    version: RULE_SET_VERSION,
    title: "Current liabilities exceed current assets",
    description: "Working capital is negative.",
    category: "RISK",
  },
  {
    ruleSetId: RULE_SET_ID,
    ruleId: "AR_GROWTH_GT_SALES",
    version: RULE_SET_VERSION,
    title: "Receivables growing faster than sales",
    description: "AR growth exceeds revenue growth across comparable periods.",
    category: "OBSERVATION",
  },
  {
    ruleSetId: RULE_SET_ID,
    ruleId: "OPEX_GROWTH_GT_REV",
    version: RULE_SET_VERSION,
    title: "Operating expenses growing faster than revenue",
    description: "Opex growth exceeds revenue growth.",
    category: "RISK",
  },
  {
    ruleSetId: RULE_SET_ID,
    ruleId: "PERSISTENT_LOSSES",
    version: RULE_SET_VERSION,
    title: "Persistent losses across comparable periods",
    description: "Net loss in at least two comparable periods.",
    category: "RISK",
  },
  {
    ruleSetId: RULE_SET_ID,
    ruleId: "WEAK_COVERAGE",
    version: RULE_SET_VERSION,
    title: "Weak evidence coverage preventing reliable assessment",
    description: "Diagnostic coverage below score publication threshold.",
    category: "DATA_QUALITY",
  },
];
