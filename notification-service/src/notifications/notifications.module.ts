import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Notification } from "@/contracts/notification.entity.generated";
import { NotificationOutbox } from "@/entities/notification-outbox.entity";
import { NotificationService } from "@/notifications/notification.service";

@Module({
  imports: [TypeOrmModule.forFeature([Notification, NotificationOutbox])],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
