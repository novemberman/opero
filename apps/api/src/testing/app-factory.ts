import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { AppModule } from "../app.module";
import type { ApiEnv } from "../config/env";
import { configureApp } from "../configure-app";
import { EmailPort } from "../auth/email/email.port";
import { MemoryEmailService } from "./memory-email.service";

export type CreateTestAppOptions = {
  /** Override ConfigService values after module compile (e.g. enable login throttle). */
  envOverrides?: Partial<ApiEnv>;
};

export async function createTestApp(options: CreateTestAppOptions = {}): Promise<{
  app: INestApplication;
  mail: MemoryEmailService;
}> {
  const mail = new MemoryEmailService();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(EmailPort)
    .useValue(mail)
    .compile();

  if (options.envOverrides && Object.keys(options.envOverrides).length > 0) {
    const config = moduleRef.get(ConfigService);
    const originalGet = config.get.bind(config);
    config.get = ((key: string, defaultValue?: unknown) => {
      if (
        Object.prototype.hasOwnProperty.call(options.envOverrides, key) &&
        options.envOverrides![key as keyof ApiEnv] !== undefined
      ) {
        return options.envOverrides![key as keyof ApiEnv];
      }
      return originalGet(key, defaultValue as never);
    }) as typeof config.get;
  }

  const app = moduleRef.createNestApplication();
  configureApp(app, {
    CORS_ORIGINS: process.env.CORS_ORIGINS ?? "http://127.0.0.1:3000",
    NODE_ENV: "test",
  });
  await app.init();
  return { app, mail };
}

export function getCookie(
  setCookie: string[] | string | undefined,
  name: string,
): string | undefined {
  if (!setCookie) {
    return undefined;
  }
  const headers = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const header of headers) {
    if (header.startsWith(`${name}=`)) {
      return header.split(";")[0];
    }
  }
  return undefined;
}

export function mergeCookies(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join("; ");
}
