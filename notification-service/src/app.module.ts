import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BrokerModule } from "@/modules/broker/broker.module";
import { Notification } from "@/contracts/notification.entity.generated";
import { ProcessedEvent } from "@/entities/processed-event.entity";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    // SHARED Supabase — CÙNG DB backend (Phase 4, P4-3). synchronize:false vì
    // schema (bảng notification + processed_events) do backend migration dựng;
    // NS không có migration runner.
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: "postgres" as const,
        host: configService.get<string>("DB_HOST"),
        port: configService.get<number>("DB_PORT"),
        username: configService.get<string>("DB_USERNAME"),
        password: configService.get<string>("DB_PASSWORD"),
        database: configService.get<string>("DB_NAME"),
        entities: [Notification, ProcessedEvent],
        synchronize: false,
        ssl:
          configService.get<string>("NODE_ENV") === "production"
            ? { rejectUnauthorized: false }
            : false,
      }),
    }),
    BrokerModule,
  ],
})
export class AppModule {}
