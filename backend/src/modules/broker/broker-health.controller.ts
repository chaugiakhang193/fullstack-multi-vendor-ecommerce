// NestJS
import { Controller, Get } from '@nestjs/common';
import { Public } from '@/decorator/customize';

// Internal
import { RabbitMqService } from '@/modules/broker/rabbitmq.service';
import { RedisConnectionService } from '@/modules/broker/redis.service';

// Tách riêng khỏi /api/v1/health (health DB gốc — Render healthCheckPath + cron
// giữ ấm) vì RabbitMQ/Redis là dependency mới chưa proven ở production; lỗi ở
// đây KHÔNG được phép làm fail deploy hoặc đánh thức cron sai.
@Controller('health')
export class BrokerHealthController {
  constructor(
    private readonly rabbitMqService: RabbitMqService,
    private readonly redisConnectionService: RedisConnectionService,
  ) {}

  @Public()
  @Get('broker')
  async checkBroker() {
    const [rabbitmqUp, redisUp] = await Promise.all([
      this.rabbitMqService.ping(),
      this.redisConnectionService.ping(),
    ]);

    return {
      rabbitmq: rabbitmqUp ? 'up' : 'down',
      redis: redisUp ? 'up' : 'down',
    };
  }
}
