import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  acceptInvitationBodySchema,
  changeMemberRoleBodySchema,
  createOrganizationBodySchema,
  inviteMemberBodySchema,
  updateOrganizationBodySchema,
  verifyEmailBodySchema,
} from "@opero/shared";
import type { Request } from "express";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { OrgMembershipGuard } from "../authorization/org-membership.guard";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import type { AuthenticatedUser } from "../types/express";
import { OrganizationsService } from "./organizations.service";

@ApiTags("organizations")
@Controller()
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post("organizations")
  @UseGuards(SessionAuthGuard)
  async create(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBodyPipe(createOrganizationBodySchema)) body: unknown,
  ) {
    const input = body as { name: string; slug: string };
    const organization = await this.organizations.create(user, input, req.requestId);
    return { organization };
  }

  @Get("organizations")
  @UseGuards(SessionAuthGuard)
  async list(@CurrentUser() user: AuthenticatedUser) {
    const organizations = await this.organizations.listForUser(user.id);
    return { organizations };
  }

  @Get("organizations/:organizationId")
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("org:read")
  async get(@Param("organizationId") organizationId: string) {
    const organization = await this.organizations.getForMember(organizationId);
    return { organization };
  }

  @Patch("organizations/:organizationId")
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("org:update")
  async update(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBodyPipe(updateOrganizationBodySchema)) body: unknown,
  ) {
    const input = body as { name: string };
    const organization = await this.organizations.update(
      organizationId,
      user.id,
      input.name,
      req.requestId,
    );
    return { organization };
  }

  @Get("organizations/:organizationId/members")
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("org:read")
  async members(@Param("organizationId") organizationId: string) {
    const members = await this.organizations.listMembers(organizationId);
    return { members };
  }

  @Post("organizations/:organizationId/invitations")
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("member:invite")
  async invite(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBodyPipe(inviteMemberBodySchema)) body: unknown,
  ) {
    const input = body as { email: string; role: "ADMIN" | "ANALYST" | "VIEWER" };
    const invitation = await this.organizations.invite({
      organizationId,
      email: input.email,
      role: input.role,
      actor: user,
      requestId: req.requestId,
    });
    return { invitation };
  }

  @Get("organizations/:organizationId/invitations")
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("member:invite")
  async listInvitations(@Param("organizationId") organizationId: string) {
    const invitations = await this.organizations.listInvitations(organizationId);
    return { invitations };
  }

  @Post("organizations/:organizationId/invitations/:invitationId/revoke")
  @HttpCode(204)
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("invite:revoke")
  async revokeInvitation(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @Param("invitationId") invitationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizations.revokeInvitation({
      organizationId,
      invitationId,
      actorUserId: user.id,
      requestId: req.requestId,
    });
  }

  @Patch("organizations/:organizationId/members/:userId")
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("member:change_role")
  async changeRole(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBodyPipe(changeMemberRoleBodySchema)) body: unknown,
  ) {
    const input = body as { role: "OWNER" | "ADMIN" | "ANALYST" | "VIEWER" };
    await this.organizations.changeRole({
      organizationId,
      memberUserId: userId,
      role: input.role,
      actorUserId: user.id,
      actorRole: req.membership!.role,
      requestId: req.requestId,
    });
    return { ok: true };
  }

  @Delete("organizations/:organizationId/members/:userId")
  @HttpCode(204)
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("member:remove")
  async removeMember(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizations.removeMember({
      organizationId,
      memberUserId: userId,
      actorUserId: user.id,
      requestId: req.requestId,
    });
  }

  @Post("organizations/:organizationId/leave")
  @HttpCode(204)
  @UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
  @RequirePermissions("org:leave")
  async leave(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizations.leave({
      organizationId,
      userId: user.id,
      requestId: req.requestId,
    });
  }

  @Post("invitations/accept")
  @UseGuards(SessionAuthGuard)
  async acceptAuthenticated(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBodyPipe(acceptInvitationBodySchema)) body: unknown,
  ) {
    const input = body as { token: string };
    const result = await this.organizations.acceptInvitation({
      token: input.token,
      actor: user,
      requestId: req.requestId,
    });
    return result;
  }

  @Post("invitations/accept-public")
  async acceptPublic(
    @Req() req: Request,
    @Body(new ZodBodyPipe(acceptInvitationBodySchema)) body: unknown,
  ) {
    const input = body as { token: string; name?: string; password?: string };
    const result = await this.organizations.acceptInvitation({
      token: input.token,
      name: input.name,
      password: input.password,
      requestId: req.requestId,
    });
    return result;
  }

  @Post("invitations/decline")
  @HttpCode(204)
  @UseGuards(SessionAuthGuard)
  async decline(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBodyPipe(verifyEmailBodySchema)) body: unknown,
  ) {
    const input = body as { token: string };
    await this.organizations.declineInvitation({
      token: input.token,
      actor: user,
      requestId: req.requestId,
    });
  }
}
