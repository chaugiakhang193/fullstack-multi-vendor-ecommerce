import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Services
import { ProductsService } from '@/modules/products/products.service';
import { ProductStockService } from '@/modules/products/product-stock.service';
import { CategoriesService } from '@/modules/products/categories.service';
import { SearchClient } from '@/modules/products/search.client';
import { SearchWarmupService } from '@/modules/products/search-warmup.service';

// Controllers
import { ProductsController } from '@/modules/products/products.controller';
import { SellerProductsController } from '@/modules/products/seller-products.controller';
import { CategoriesController } from '@/modules/products/categories.controller';
import { AdminProductsController } from '@/modules/products/admin-products.controller';

// Entities
import { Product } from '@/modules/products/entities/product.entity';
import { Category } from '@/modules/products/entities/category.entity';
import { ProductVariant } from '@/modules/products/entities/product-variant.entity';

// Modules
import { CloudinaryModule } from '@/modules/cloudinary/cloudinary.module';
import { ShopsModule } from '@/modules/shops/shops.module';
import { MetricsModule } from '@/modules/metrics/metrics.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Category, ProductVariant]),
    CloudinaryModule,
    forwardRef(() => ShopsModule),
    MetricsModule,
  ],
  controllers: [
    ProductsController,
    SellerProductsController,
    CategoriesController,
    AdminProductsController,
  ],
  providers: [
    ProductsService,
    ProductStockService,
    CategoriesService,
    SearchClient,
    SearchWarmupService,
  ],
  exports: [ProductsService, ProductStockService, CategoriesService],
})
export class ProductsModule {}
