import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnv } from "../config/env";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { CsrfService } from "./csrf.service";
import { createEmailPort } from "./email/create-email.provider";
import { EmailPort } from "./email/email.port";
import { LoginRateLimitGuard } from "./guards/login-rate-limit.guard";
import { SessionAuthGuard } from "./guards/session-auth.guard";
import { SessionService } from "./session.service";

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    SessionAuthGuard,
    LoginRateLimitGuard,
    CsrfService,
    {
      provide: EmailPort,
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApiEnv, true>) => createEmailPort(config),
    },
  ],
  exports: [SessionService, SessionAuthGuard, CsrfService, AuthService, EmailPort],
})
export class AuthModule {}
