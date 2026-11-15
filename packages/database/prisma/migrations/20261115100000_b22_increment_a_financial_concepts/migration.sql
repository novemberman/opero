-- B2.2 Increment A: additive FinancialConcept values for taxonomy expansion.
-- Map-only release — does not rewrite historical rows or change diagnostic formulas.
ALTER TYPE "FinancialConcept" ADD VALUE 'PROFIT_BEFORE_TAX';
ALTER TYPE "FinancialConcept" ADD VALUE 'INCOME_TAX_EXPENSE';
ALTER TYPE "FinancialConcept" ADD VALUE 'OPENING_CASH_AND_EQUIVALENTS';
ALTER TYPE "FinancialConcept" ADD VALUE 'INVESTING_CASH_FLOW';
ALTER TYPE "FinancialConcept" ADD VALUE 'FINANCING_CASH_FLOW';
ALTER TYPE "FinancialConcept" ADD VALUE 'NET_CHANGE_IN_CASH';
