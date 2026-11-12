import { Global, Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { CsrfService } from "./csrf.service";
import { DevEmailService } from "./email/dev-email.service";
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
    { provide: EmailPort, useClass: DevEmailService },
  ],
  exports: [SessionService, SessionAuthGuard, CsrfService, AuthService, EmailPort],
})
export class AuthModule {}


