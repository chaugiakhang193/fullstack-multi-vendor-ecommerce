import { Global, Module } from "@nestjs/common";
import { RabbitMqService } from "@/modules/broker/rabbitmq.service";
import { RedisConnectionService } from "@/modules/broker/redis.service";
import { HealthController } from "@/modules/broker/health.controller";

// Global vì Phase 4+ (consumer handlers) sẽ inject 2 service này từ nhiều
// module khác nhau.
@Global()
@Module({
  controllers: [HealthController],
  providers: [RabbitMqService, RedisConnectionService],
  exports: [RabbitMqService, RedisConnectionService],
})
export class BrokerModule {}
