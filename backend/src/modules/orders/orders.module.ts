import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OutboxEvent } from './entities/outbox-event.entity';
import { Order } from './entities/order.entity';
import { SubOrder } from './entities/sub-order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Idempotency } from './entities/idempotency.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OutboxEvent,
      Order,
      SubOrder,
      OrderItem,
      Idempotency,
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
