import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { SessionService } from "../session.service";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const raw = req.cookies?.[this.sessions.cookieName()] as string | undefined;
    const resolved = await this.sessions.resolveSession(raw);
    if (!resolved) {
      throw new UnauthorizedException("Authentication required");
    }
    req.user = resolved.user;
    req.sessionId = resolved.sessionId;
    return true;
  }
}
