import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BrokerModule } from "@/modules/broker/broker.module";
import { Notification } from "@/contracts/notification.entity.generated";
import { ProcessedEvent } from "@/entities/processed-event.entity";
import { NotificationOutbox } from "@/entities/notification-outbox.entity";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    ScheduleModule.forRoot(),
    // OWN Supabase #2 — DB RIÊNG của Notification-Service (Phase 6, source of
    // truth). Schema quản bằng migration runner của NS (src/database). Bell ở
    // monolith đọc read model riêng (projection notification_read, part_03).
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
        entities: [Notification, ProcessedEvent, NotificationOutbox],
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
