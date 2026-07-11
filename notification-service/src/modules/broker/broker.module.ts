import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RabbitMqService } from "@/modules/broker/rabbitmq.service";
import { RedisConnectionService } from "@/modules/broker/redis.service";
import { NotificationEmitterService } from "@/modules/broker/notification-emitter.service";
import { NotificationOutboxRelay } from "@/modules/broker/notification-outbox.relay";
import { HealthController } from "@/modules/broker/health.controller";
import { ProcessedEvent } from "@/entities/processed-event.entity";
import { NotificationOutbox } from "@/entities/notification-outbox.entity";
import { ConsumerModule } from "@/consumer/consumer.module";

// Global vì Phase 4+ (consumer handlers) sẽ inject 2 service này từ nhiều
// module khác nhau.
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([ProcessedEvent, NotificationOutbox]),
    ConsumerModule,
  ],
  controllers: [HealthController],
  providers: [
    RabbitMqService,
    RedisConnectionService,
    NotificationEmitterService,
    NotificationOutboxRelay,
  ],
  exports: [
    RabbitMqService,
    RedisConnectionService,
    NotificationEmitterService,
  ],
})
export class BrokerModule {}
