import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { CloudinaryService } from '@/modules/cloudinary/cloudinary.service';
import { DataSource, Not, IsNull } from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { Shop } from '@/modules/shops/entities/shop.entity';
import { Category } from '@/modules/products/entities/category.entity';
import { Product } from '@/modules/products/entities/product.entity';
import { ProductVariant } from '@/modules/products/entities/product-variant.entity';
import { JwtService } from '@nestjs/jwt';
import { ACCESS_TOKEN_SERVICE } from '@/auth/auth.constants';
import { UserRole, AccountStatus } from '@/modules/enums';
import { hashDataHelper } from '@/helpers/ultis';
import * as crypto from 'crypto';

describe('Product Management (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let sellerToken: string;
  let sellerUser: User;
  let sellerShop: Shop;
  let testCategory: Category;
  let createdProductId: string;
  let createdVariantId: string;
  let createdVariantImage: string;

  const mockCloudinaryService = {
    uploadFile: jest.fn().mockImplementation((file, folder, userSub, assetType, shopId) => {
      return Promise.resolve({
        id: crypto.randomUUID(),
        public_id: `mock-public-id-${crypto.randomUUID()}`,
        url: `https://res.cloudinary.com/mock-cloud/image/upload/v12345/${folder}/mock-file.jpg`,
      });
    }),
    findAssetByUrl: jest.fn().mockImplementation(() => {
      return Promise.resolve({
        id: crypto.randomUUID(),
        public_id: 'mock-public-id',
      });
    }),
    deleteFile: jest.fn().mockResolvedValue(true),
    deleteAsset: jest.fn().mockResolvedValue(true),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CloudinaryService)
      .useValue(mockCloudinaryService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    jwtService = moduleFixture.get<JwtService>(ACCESS_TOKEN_SERVICE);

    // Clear existing related test data just in case
    await dataSource.getRepository(ProductVariant).delete({ id: Not(IsNull()) });
    await dataSource.getRepository(Product).delete({ id: Not(IsNull()) });
    await dataSource.getRepository(Shop).delete({ id: Not(IsNull()) });
    await dataSource.getRepository(User).delete({ email: 'e2e-seller@example.com' });
    await dataSource.getRepository(Category).delete({ slug: 'e2e-test-category' });
    await dataSource.getRepository(Category).delete({ slug: 'e2e-parent-category' });

    // 1. Seed Seller User
    const hashedPassword = await hashDataHelper('Password123!');
    sellerUser = dataSource.getRepository(User).create({
      username: 'e2eseller',
      email: 'e2e-seller@example.com',
      password: hashedPassword,
      role: UserRole.SELLER,
      status: AccountStatus.ACTIVE,
      full_name: 'E2E Seller',
    });
    await dataSource.getRepository(User).save(sellerUser);

    // 2. Seed Shop
    sellerShop = dataSource.getRepository(Shop).create({
      seller: sellerUser,
      name: 'E2E Test Shop',
      status: AccountStatus.ACTIVE,
      description: 'E2E testing shop',
    });
    await dataSource.getRepository(Shop).save(sellerShop);

    // 3. Seed Category
    const parentCategory = dataSource.getRepository(Category).create({
      name: 'E2E Parent Category',
      slug: 'e2e-parent-category',
    });
    await dataSource.getRepository(Category).save(parentCategory);

    testCategory = dataSource.getRepository(Category).create({
      name: 'E2E Test Category',
      slug: 'e2e-test-category',
      parent: parentCategory,
    });
    await dataSource.getRepository(Category).save(testCategory);

    // 4. Generate signed JWT token
    sellerToken = await jwtService.signAsync({
      sub: sellerUser.id,
      username: sellerUser.username,
      role: sellerUser.role,
      status: sellerUser.status,
    });
  });

  afterAll(async () => {
    // Clean up all seeded data
    if (dataSource) {
      await dataSource.getRepository(ProductVariant).delete({ id: Not(IsNull()) });
      await dataSource.getRepository(Product).delete({ id: Not(IsNull()) });
      await dataSource.getRepository(Shop).delete({ id: Not(IsNull()) });
      await dataSource.getRepository(User).delete({ id: sellerUser.id });
      await dataSource.getRepository(Category).delete({ slug: 'e2e-test-category' });
      await dataSource.getRepository(Category).delete({ slug: 'e2e-parent-category' });
      await dataSource.destroy();
    }
    if (app) {
      await app.close();
    }
  });

  it('POST /seller/products -> should successfully create a product with variants and files', async () => {
    const variantsPayload = [
      {
        name: 'Red variant',
        additional_price: 15000,
        sku: 'E2E-RED',
        stock_quantity: 100,
        imageCount: 1,
      },
      {
        name: 'Blue variant',
        additional_price: 20000,
        sku: 'E2E-BLUE',
        stock_quantity: 80,
        imageCount: 2,
      },
    ];

    const response = await request(app.getHttpServer())
      .post('/seller/products')
      .set('Authorization', `Bearer ${sellerToken}`)
      // Uploading files: supertest uses .attach(field, buffer, filename)
      .attach('thumbnail', Buffer.from('mock-thumbnail-image'), 'thumbnail.jpg')
      .attach('general_gallery', Buffer.from('mock-gallery-1'), 'gallery1.jpg')
      .attach('general_gallery', Buffer.from('mock-gallery-2'), 'gallery2.jpg')
      .attach('variant_images', Buffer.from('mock-v1'), 'v1.jpg')
      .attach('variant_images', Buffer.from('mock-v2'), 'v2.jpg')
      .attach('variant_images', Buffer.from('mock-v3'), 'v3.jpg')
      // Non-file fields
      .field('name', 'E2E Super Shirt')
      .field('description', 'An awesome shirt tested via E2E')
      .field('price', '150000')
      .field('weight', '200')
      .field('length', '15')
      .field('width', '10')
      .field('height', '5')
      .field('category_id', testCategory.id)
      .field('has_variants', 'true')
      .field('variants', JSON.stringify(variantsPayload));

    if (response.status !== 201) {
      console.log('CREATE PRODUCT FAILED RESP:', response.body);
    }

    expect(response.status).toBe(201);

    expect(response.body.message).toBe('Tạo sản phẩm thành công');
    expect(response.body.data).toBeDefined();
    expect(response.body.data.name).toBe('E2E Super Shirt');
    expect(response.body.data.slug).toContain('e2e-super-shirt');
    expect(response.body.data.thumbnail_url).toBeDefined();
    expect(response.body.data.gallery.length).toBe(2);
    expect(response.body.data.variants.length).toBe(2);

    createdProductId = response.body.data.id;
    createdVariantId = response.body.data.variants[0].id;
    createdVariantImage = response.body.data.variants[0].images[0];
  });

  it('GET /seller/products -> should get product list belonging to seller shop', async () => {
    const response = await request(app.getHttpServer())
      .get('/seller/products')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);

    expect(response.body.message).toBe('Lấy danh sách sản phẩm thành công');
    expect(response.body.data).toBeDefined();
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThanOrEqual(1);

    const foundProduct = response.body.data.find(p => p.id === createdProductId);
    expect(foundProduct).toBeDefined();
    expect(foundProduct.name).toBe('E2E Super Shirt');
  });

  it('PATCH /seller/products/:id -> should successfully update product details and variants', async () => {
    // We will update the name, price, and update the stock quantity of variants
    const updatedVariantsPayload = [
      {
        id: createdVariantId,
        name: 'Red variant updated',
        additional_price: 18000,
        sku: 'E2E-RED-UPDATED',
        stock_quantity: 120,
        existingImages: [createdVariantImage],
        imageCount: 0,
      },
    ];

    const response = await request(app.getHttpServer())
      .patch(`/seller/products/${createdProductId}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .attach('thumbnail', Buffer.from('mock-thumbnail-image-updated'), 'thumbnail_updated.jpg')
      .field('name', 'E2E Super Shirt Updated')
      .field('price', '165000')
      .field('has_variants', 'true')
      .field('variants', JSON.stringify(updatedVariantsPayload))
      .expect(200);

    expect(response.body.message).toBe('Cập nhật sản phẩm thành công');
    expect(response.body.data).toBeDefined();
    expect(response.body.data.name).toBe('E2E Super Shirt Updated');
    expect(Number(response.body.data.price)).toBe(165000);
  });

  it('DELETE /seller/products/:id -> should hard delete the product, clear variants and mock delete Cloudinary assets', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/seller/products/${createdProductId}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);

    expect(response.body.message).toBe('Xóa sản phẩm thành công');

    // Verify it was soft deleted and properties were cleaned up
    const dbProduct = await dataSource.getRepository(Product).findOne({
      where: { id: createdProductId },
    });
    expect(dbProduct).toBeDefined();
    expect(dbProduct!.status).toBe('deleted');
    expect(dbProduct!.thumbnail_url).toBeNull();
    expect(dbProduct!.gallery).toEqual([]);
    expect(dbProduct!.stock_quantity).toBe(0);
  });
});
