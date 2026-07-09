import { Module } from "@nestjs/common";
import { NotificationsModule } from "@/notifications/notifications.module";
import { MailModule } from "@/mail/mail.module";
import { NotificationConsumerService } from "@/consumer/notification-consumer.service";

@Module({
  imports: [NotificationsModule, MailModule],
  providers: [NotificationConsumerService],
  exports: [NotificationConsumerService],
})
export class ConsumerModule {}
