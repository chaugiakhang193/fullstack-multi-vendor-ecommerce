import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ReturnsController } from '@/modules/returns/returns.controller';
import { SellerReturnsController } from '@/modules/returns/seller-returns.controller';
import { ReturnsService } from '@/modules/returns/returns.service';

import { ReturnRequest } from '@/modules/returns/entities/return-request.entity';
import { ReturnItem } from '@/modules/returns/entities/return-item.entity';

// OrdersModule export OrdersService — ReturnsService gọi qua đó để lock/load sub-order
// thay vì inject repo chéo module. Một chiều returns → orders nên không tạo circular.
import { OrdersModule } from '@/modules/orders/orders.module';
import { ProductsModule } from '@/modules/products/products.module';
import { ShopsModule } from '@/modules/shops/shops.module';

@Module({
  imports: [
    // Chỉ đăng ký entity của CHÍNH module này.
    TypeOrmModule.forFeature([ReturnRequest, ReturnItem]),
    OrdersModule,
    ProductsModule, // ProductStockService để restock item-level khi RECEIVED
    ShopsModule, // ShopsService.getSellerIdsByShopIds để enrich outbox payload
  ],
  controllers: [ReturnsController, SellerReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
