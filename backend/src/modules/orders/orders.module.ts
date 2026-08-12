import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

// Services
import { OrdersService } from '@/modules/orders/orders.service';

// Controllers
import { OrdersController } from '@/modules/orders/orders.controller';
import { SellerOrdersController } from '@/modules/orders/seller-orders.controller';

// Crons & Processors
import { IdempotencyCleanupCron } from '@/modules/orders/idempotency-cleanup.cron';
import { VnpayExpiryProcessor } from '@/modules/orders/vnpay-expiry.processor';
import { VnpayExpirySweep } from '@/modules/orders/vnpay-expiry.sweep';

// Constants
import { VNPAY_EXPIRY_QUEUE } from '@/modules/orders/vnpay-expiry.constants';

// Entities
import { OutboxEvent } from '@/common/entities/outbox-event.entity';
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
import { ShopsModule } from '@/modules/shops/shops.module';

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
    BullModule.registerQueue({ name: VNPAY_EXPIRY_QUEUE }),
    ProductsModule,
    PromotionsModule,
    UsersModule,
    ShopsModule,
    CartsModule,
    PaymentsModule,
  ],
  controllers: [OrdersController, SellerOrdersController],
  providers: [
    OrdersService,
    IdempotencyCleanupCron,
    VnpayExpiryProcessor,
    VnpayExpirySweep,
    {
      provide: 'IShippingCalculator',
      useClass: HaversineShippingCalculator,
    },
  ],
  exports: [OrdersService, 'IShippingCalculator'],
})
export class OrdersModule {}
