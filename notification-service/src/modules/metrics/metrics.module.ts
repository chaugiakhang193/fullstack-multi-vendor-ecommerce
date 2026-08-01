import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { NotificationOutbox } from "@/entities/notification-outbox.entity";
import { MetricsService } from "./metrics.service";
import { MetricsController } from "./metrics.controller";

@Module({
  imports: [TypeOrmModule.forFeature([NotificationOutbox])],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
