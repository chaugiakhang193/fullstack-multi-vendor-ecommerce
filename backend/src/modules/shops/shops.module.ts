import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Services
import { ShopsService } from '@/modules/shops/shops.service';

// Controllers
import { ShopsController } from '@/modules/shops/shops.controller';
import { SellerShopsController } from '@/modules/shops/seller-shops.controller';
import { AdminShopsController } from '@/modules/shops/admin-shops.controller';

// Entities
import { Shop } from '@/modules/shops/entities/shop.entity';

// Modules
import { CloudinaryModule } from '@/modules/cloudinary/cloudinary.module';
import { UsersModule } from '@/modules/users/users.module';
import { ProductsModule } from '@/modules/products/products.module';
import { GeocodingModule } from '@/modules/geocoding/geocoding.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Shop]),
    CloudinaryModule,
    forwardRef(() => UsersModule),
    forwardRef(() => ProductsModule),
    forwardRef(() => GeocodingModule),
  ],
  controllers: [ShopsController, SellerShopsController, AdminShopsController],
  providers: [ShopsService],
  exports: [ShopsService],
})
export class ShopsModule {}
