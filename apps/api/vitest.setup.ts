import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(import.meta.dirname, "../../.env") });

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  (process.env.DATABASE_URL ?? "").replace(/\/opero(\?|$)/, "/opero_test$1");

/**
 * Integration suites must hit an isolated local test DB (never staging/prod).
 * Prefer TEST_DATABASE_URL=postgresql://…@127.0.0.1:54329/opero_test.
 * Set ALLOW_REMOTE_TEST_DB=true only for explicitly provisioned remote CI DBs.
 */
try {
  const dbUrl = new URL(process.env.DATABASE_URL);
  const host = dbUrl.hostname;
  const local =
    host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (!local && process.env.ALLOW_REMOTE_TEST_DB !== "true") {
    throw new Error(
      `Refusing API tests against non-local DATABASE_URL host "${host}". ` +
        `Use TEST_DATABASE_URL pointing at 127.0.0.1/opero_test, or set ALLOW_REMOTE_TEST_DB=true.`,
    );
  }
  if (!dbUrl.pathname.includes("opero_test") && process.env.ALLOW_REMOTE_TEST_DB !== "true") {
    throw new Error(
      `Refusing API tests against database "${dbUrl.pathname}". Expected /opero_test.`,
    );
  }
} catch (error) {
  if (error instanceof TypeError) {
    throw new Error(`Invalid DATABASE_URL for API tests: ${process.env.DATABASE_URL}`);
  }
  throw error;
}

process.env.MAIL_DIR = resolve(import.meta.dirname, "../../.data/mail-test");
// Skip global/default throttlers for deterministic suites. Login throttle tests
// override AUTH_THROTTLE_DISABLED=false with a low AUTH_LOGIN_THROTTLE_LIMIT.
process.env.AUTH_THROTTLE_DISABLED = "true";
process.env.DOCUMENT_STORAGE_DRIVER = "memory";
process.env.DOCUMENT_SCANNER_DRIVER = "mock";
process.env.PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER ?? "mock";
process.env.REDIS_PASSWORD =
  process.env.REDIS_PASSWORD ?? "replace-with-local-dev-password";


