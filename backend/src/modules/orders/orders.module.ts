import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Services
import { OrdersService } from '@/modules/orders/orders.service';

// Controllers
import { OrdersController } from '@/modules/orders/orders.controller';
import { SellerOrdersController } from '@/modules/orders/seller-orders.controller';

// Crons
import { IdempotencyCleanupCron } from '@/modules/orders/idempotency-cleanup.cron';

// Entities
import { OutboxEvent } from '@/modules/orders/entities/outbox-event.entity';
import { Order } from '@/modules/orders/entities/order.entity';
import { SubOrder } from '@/modules/orders/entities/sub-order.entity';
import { OrderItem } from '@/modules/orders/entities/order-item.entity';
import { Idempotency } from '@/modules/orders/entities/idempotency.entity';

// Cross-module dependencies — tuân theo Rule II.11 (không tiêm chéo Repository)
import { ProductsModule } from '@/modules/products/products.module';
import { PromotionsModule } from '@/modules/promotions/promotions.module';
import { UsersModule } from '@/modules/users/users.module';
import { CartsModule } from '@/modules/carts/carts.module';
import { PaymentsModule } from '@/modules/payments/payments.module';

// Calculators
import { HaversineShippingCalculator } from '@/modules/orders/haversine-shipping.calculator';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OutboxEvent,
      Order,
      SubOrder,
      OrderItem,
      Idempotency,
    ]),
    ProductsModule,
    PromotionsModule,
    UsersModule,
    CartsModule,
    PaymentsModule,
  ],
  controllers: [OrdersController, SellerOrdersController],
  providers: [
    OrdersService,
    IdempotencyCleanupCron,
    {
      provide: 'IShippingCalculator',
      useClass: HaversineShippingCalculator,
    },
  ],
  exports: [OrdersService, 'IShippingCalculator'],
})
export class OrdersModule {}
