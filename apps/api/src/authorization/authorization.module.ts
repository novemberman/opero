import { Global, Module } from "@nestjs/common";
import { OrgMembershipGuard } from "./org-membership.guard";
import { PermissionsGuard } from "./permissions.guard";

@Global()
@Module({
  providers: [OrgMembershipGuard, PermissionsGuard],
  exports: [OrgMembershipGuard, PermissionsGuard],
})
export class AuthorizationModule {}
