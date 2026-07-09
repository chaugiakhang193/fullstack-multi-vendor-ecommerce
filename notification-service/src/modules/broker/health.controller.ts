// NestJS
import { Controller, Get } from "@nestjs/common";

// Internal
import { RabbitMqService } from "@/modules/broker/rabbitmq.service";
import { RedisConnectionService } from "@/modules/broker/redis.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly rabbitMqService: RabbitMqService,
    private readonly redisConnectionService: RedisConnectionService,
  ) {}

  // Render healthCheckPath + on-publish poke đều gọi endpoint này — phải luôn
  // trả 200 bất kể broker đang up hay down, nếu không Render sẽ coi service
  // unhealthy và không đánh thức được từ trạng thái ngủ.
  @Get()
  checkAlive() {
    return { status: "ok" };
  }

  @Get("broker")
  async checkBroker() {
    const [rabbitmqUp, redisUp] = await Promise.all([
      this.rabbitMqService.ping(),
      this.redisConnectionService.ping(),
    ]);

    return {
      rabbitmq: rabbitmqUp ? "up" : "down",
      redis: redisUp ? "up" : "down",
    };
  }
}
