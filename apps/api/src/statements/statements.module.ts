import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { StatementsController } from "./statements.controller";
import { StatementsService } from "./statements.service";

@Module({
  imports: [AuthModule],
  controllers: [StatementsController],
  providers: [StatementsService],
})
export class StatementsModule {}
