-- B2.2 Increment B1: additive FinancialConcept values for BS/equity/tax liability recognition.
-- Map-only release — does not rewrite historical rows or change diagnostic formulas.
ALTER TYPE "FinancialConcept" ADD VALUE 'SHARE_CAPITAL';
ALTER TYPE "FinancialConcept" ADD VALUE 'RETAINED_EARNINGS';
ALTER TYPE "FinancialConcept" ADD VALUE 'TAX_PAYABLE';
ALTER TYPE "FinancialConcept" ADD VALUE 'TOTAL_LIABILITIES_AND_EQUITY';
