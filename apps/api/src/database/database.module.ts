import { Global, Module, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PrismaClient } from "@opero/database";
import type { ApiEnv } from "../config/env";
import { PRISMA_CLIENT } from "./database.constants";
import { loadDatabaseModule } from "./load-database";

@Global()
@Module({
  providers: [
    {
      provide: PRISMA_CLIENT,
      inject: [ConfigService],
      useFactory: async (config: ConfigService<ApiEnv, true>): Promise<PrismaClient> => {
        const { createPrismaClient } = await loadDatabaseModule();
        return createPrismaClient(config.get("DATABASE_URL", { infer: true }));
      },
    },
  ],
  exports: [PRISMA_CLIENT],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(private readonly config: ConfigService<ApiEnv, true>) {}

  // Nest resolves provider separately; disconnect via injected client in tests/services.
  async onModuleDestroy(): Promise<void> {
    void this.config;
  }
}
