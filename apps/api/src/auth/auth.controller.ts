import {
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
  Body,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
  verifyEmailBodySchema,
} from "@opero/shared";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { LoginRateLimitGuard } from "./guards/login-rate-limit.guard";
import { SessionAuthGuard } from "./guards/session-auth.guard";
import type { AuthenticatedUser } from "../types/express";
import { CsrfService } from "./csrf.service";


@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly csrf: CsrfService,
  ) {}

  @Get("csrf")
  @HttpCode(200)
  csrfToken(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = this.csrf.issueToken(req, res);
    return { csrfToken: token };
  }

  @Post("register")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Req() req: Request,
    @Body(new ZodBodyPipe(registerBodySchema)) body: unknown,
  ) {
    const input = body as {
      email: string;
      name: string;
      password: string;
    };
    const user = await this.auth.register({ ...input, requestId: req.requestId });
    return { user };
  }

  @Post("login")
  @HttpCode(200)
  @UseGuards(LoginRateLimitGuard)
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodBodyPipe(loginBodySchema)) body: unknown,
  ) {
    const input = body as { email: string; password: string };
    const user = await this.auth.login({ ...input, req, res });
    return { user };
  }

  @Post("logout")
  @HttpCode(204)
  @UseGuards(SessionAuthGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req, res);
  }

  @Get("me")
  @UseGuards(SessionAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  @Post("verify-email")
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyEmail(
    @Req() req: Request,
    @Body(new ZodBodyPipe(verifyEmailBodySchema)) body: unknown,
  ) {
    const input = body as { token: string };
    await this.auth.verifyEmail(input.token, req.requestId);
  }

  @Post("forgot-password")
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async forgotPassword(
    @Req() req: Request,
    @Body(new ZodBodyPipe(forgotPasswordBodySchema)) body: unknown,
  ) {
    const input = body as { email: string };
    await this.auth.forgotPassword(input.email, req.requestId);
  }

  @Post("reset-password")
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(
    @Req() req: Request,
    @Body(new ZodBodyPipe(resetPasswordBodySchema)) body: unknown,
  ) {
    const input = body as { token: string; password: string };
    await this.auth.resetPassword({ ...input, requestId: req.requestId });
  }
}
