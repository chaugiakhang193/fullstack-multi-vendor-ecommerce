// NestJS
import { Global, Module } from '@nestjs/common';

// Service
import { NsWarmupService } from '@/modules/ns-warmup/ns-warmup.service';

/**
 * Tiện ích cross-cutting (carts/orders/engagements đều dùng) nên để @Global():
 * consumer chỉ cần inject NsWarmupService, KHÔNG phải thêm vào `imports` của module mình
 * → tránh circular dep (OrdersModule đã import CartsModule, EngagementsModule import OrdersModule).
 * ConfigModule đã isGlobal ở app.module nên không cần import lại ở đây.
 */
@Global()
@Module({
  providers: [NsWarmupService],
  exports: [NsWarmupService],
})
export class NsWarmupModule {}
