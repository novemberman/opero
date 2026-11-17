import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { PilotInvitationController } from "./pilot-invitation.controller";
import { PilotInvitationService } from "./pilot-invitation.service";
import { PilotOpsController } from "./pilot-ops.controller";
import { SyntheticEntitlementOpsController } from "./synthetic-entitlement-ops.controller";
import { SyntheticEntitlementService } from "./synthetic-entitlement.service";

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [
    PilotOpsController,
    PilotInvitationController,
    SyntheticEntitlementOpsController,
  ],
  providers: [PilotInvitationService, SyntheticEntitlementService],
  exports: [PilotInvitationService, SyntheticEntitlementService],
})
export class PilotModule {}
