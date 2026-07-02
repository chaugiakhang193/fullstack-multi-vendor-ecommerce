import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ReturnsController } from '@/modules/returns/returns.controller';
import { ReturnsService } from '@/modules/returns/returns.service';

import { ReturnRequest } from '@/modules/returns/entities/return-request.entity';
import { ReturnItem } from '@/modules/returns/entities/return-item.entity';

// OrdersModule export OrdersService — ReturnsService gọi qua đó để lock/load sub-order
// thay vì inject repo chéo module. Một chiều returns → orders nên không tạo circular.
import { OrdersModule } from '@/modules/orders/orders.module';

@Module({
  imports: [
    // Chỉ đăng ký entity của CHÍNH module này.
    TypeOrmModule.forFeature([ReturnRequest, ReturnItem]),
    OrdersModule,
  ],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService], // Part 2: seller-returns controller sẽ dùng lại.
})
export class ReturnsModule {}
