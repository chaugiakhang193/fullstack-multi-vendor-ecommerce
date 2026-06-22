import { Injectable } from '@nestjs/common';
import { UsersService } from '@/modules/users/users.service';
import { ShopsService } from '@/modules/shops/shops.service';
import { CategoriesService } from '@/modules/products/categories.service';
import { OrdersService } from '@/modules/orders/orders.service';
import { UserRole, AccountStatus } from '@/common/enums';
import { AdminStatsResponseDto } from './dto/admin-stats-response.dto';

@Injectable()
export class StatisticsService {
  constructor(
    private readonly usersService: UsersService,
    private readonly shopsService: ShopsService,
    private readonly categoriesService: CategoriesService,
    private readonly ordersService: OrdersService,
  ) {}

  async getAdminOverview(): Promise<AdminStatsResponseDto> {
    const [
      total_users,
      total_customers,
      total_sellers,
      total_shops,
      pending_shops,
      total_categories,
      total_orders,
      total_revenue,
    ] = await Promise.all([
      this.usersService.countAll(),
      this.usersService.countByRole(UserRole.CUSTOMER),
      this.usersService.countByRole(UserRole.SELLER),
      this.shopsService.countAll(),
      this.shopsService.countByStatus(AccountStatus.PENDING_APPROVAL),
      this.categoriesService.countAll(),
      this.ordersService.countAll(),
      this.ordersService.getDeliveredRevenue(),
    ]);

    return {
      total_users,
      total_customers,
      total_sellers,
      total_shops,
      pending_shops,
      total_categories,
      total_orders,
      total_revenue,
    };
  }
}
