import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(import.meta.dirname, "../../.env") });

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  (process.env.DATABASE_URL ?? "").replace(/\/opero(\?|$)/, "/opero_test$1");
process.env.MAIL_DIR = resolve(import.meta.dirname, "../../.data/mail-test");
// Skip global/default throttlers for deterministic suites. Login throttle tests
// override AUTH_THROTTLE_DISABLED=false with a low AUTH_LOGIN_THROTTLE_LIMIT.
process.env.AUTH_THROTTLE_DISABLED = "true";

