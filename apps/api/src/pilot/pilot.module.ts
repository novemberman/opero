import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { PilotInvitationController } from "./pilot-invitation.controller";
import { PilotInvitationService } from "./pilot-invitation.service";
import { PilotOpsController } from "./pilot-ops.controller";

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [PilotOpsController, PilotInvitationController],
  providers: [PilotInvitationService],
  exports: [PilotInvitationService],
})
export class PilotModule {}
