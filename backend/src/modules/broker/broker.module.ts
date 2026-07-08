import { Global, Module } from '@nestjs/common';
import { RabbitMqService } from '@/modules/broker/rabbitmq.service';
import { RedisConnectionService } from '@/modules/broker/redis.service';
import { BrokerHealthController } from '@/modules/broker/broker-health.controller';

// Global vì Phase 3+ (relay, gateway redis-adapter) sẽ inject 2 service này
// từ nhiều module khác nhau (engagements, orders...).
@Global()
@Module({
  controllers: [BrokerHealthController],
  providers: [RabbitMqService, RedisConnectionService],
  exports: [RabbitMqService, RedisConnectionService],
})
export class BrokerModule {}
