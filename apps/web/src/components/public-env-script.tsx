import { connection } from "next/server";
import {
  getPublicEnvForInjection,
  OPERO_PUBLIC_ENV_GLOBAL,
} from "../lib/public-env";

/**
 * Injects runtime public config into the document before client JS runs.
 * Must stay a Server Component so `process.env` is read at request time.
 */
export async function PublicEnvScript() {
  // Opt this render into request time so Docker/Railway runtime env is used.
  await connection();
  const publicEnv = getPublicEnvForInjection();
  const payload = JSON.stringify(publicEnv).replace(/</g, "\\u003c");

  return (
    <script
      // Runs before hydration so client `apiFetch` can read the injected value.
      dangerouslySetInnerHTML={{
        __html: `window[${JSON.stringify(OPERO_PUBLIC_ENV_GLOBAL)}]=${payload};`,
      }}
    />
  );
}
