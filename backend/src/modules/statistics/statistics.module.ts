import { Module } from '@nestjs/common';
import { AdminStatsController } from './admin-stats.controller';
import { StatisticsService } from './statistics.service';
import { UsersModule } from '@/modules/users/users.module';
import { ShopsModule } from '@/modules/shops/shops.module';
import { ProductsModule } from '@/modules/products/products.module';
import { OrdersModule } from '@/modules/orders/orders.module';

@Module({
  imports: [
    UsersModule,
    ShopsModule,
    ProductsModule,
    OrdersModule,
  ],
  controllers: [AdminStatsController],
  providers: [StatisticsService],
  exports: [StatisticsService],
})
export class StatisticsModule {}
