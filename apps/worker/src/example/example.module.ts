import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { EXAMPLE_QUEUE } from "./example.constants";
import { ExampleProcessor } from "./example.processor";

@Module({
  imports: [BullModule.registerQueue({ name: EXAMPLE_QUEUE })],
  providers: [ExampleProcessor],
})
export class ExampleModule {}
