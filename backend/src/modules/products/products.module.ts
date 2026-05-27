import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Services
import { ProductsService } from '@/modules/products/products.service';
import { CategoriesService } from '@/modules/products/categories.service';

// Controllers
import { ProductsController } from '@/modules/products/products.controller';
import { SellerProductsController } from '@/modules/products/seller-products.controller';
import { CategoriesController } from '@/modules/products/categories.controller';

// Entities
import { Product } from '@/modules/products/entities/product.entity';
import { Category } from '@/modules/products/entities/category.entity';
import { ProductVariant } from '@/modules/products/entities/product-variant.entity';

// Modules
import { CloudinaryModule } from '@/modules/cloudinary/cloudinary.module';
import { ShopsModule } from '@/modules/shops/shops.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Category, ProductVariant]),
    CloudinaryModule,
    forwardRef(() => ShopsModule),
  ],
  controllers: [
    ProductsController,
    SellerProductsController,
    CategoriesController,
  ],
  providers: [ProductsService, CategoriesService],
  exports: [ProductsService, CategoriesService],
})
export class ProductsModule {}
