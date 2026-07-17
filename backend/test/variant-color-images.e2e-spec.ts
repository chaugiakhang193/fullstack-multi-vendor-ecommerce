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
import { UserRole, AccountStatus } from '@/common/enums';
import { hashDataHelper } from '@/common/helpers/utils';
import * as crypto from 'crypto';

/**
 * Kịch bản chính: EDIT một sản phẩm LEGACY (color_groups = null, ảnh nằm ở
 * variant.images) bằng protocol MÀU (colorImages). Bug đã sửa: vòng lặp variant
 * KHÔNG được xóa asset theo variant.images khi usingColorModel — vì các URL đó
 * vừa được migrate vào color_groups.existingImages. Nếu xóa → phá ảnh vừa giữ.
 */
describe('Variant color-images — legacy edit (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let sellerToken: string;
  let sellerUser: User;
  let sellerShop: Shop;
  let testCategory: Category;

  const LEGACY_RED = 'https://res.cloudinary.com/mock/upload/v1/legacy-red.jpg';

  // public_id suy diễn từ url (deterministic) để assert đúng file bị/không bị xóa.
  const publicIdOf = (url: string) => `pub::${url}`;

  let uploadCounter = 0;
  const deletedPublicIds: string[] = [];

  const mockCloudinaryService = {
    uploadFile: jest.fn().mockImplementation((file, folder) => {
      uploadCounter += 1;
      const url = `https://res.cloudinary.com/mock/upload/v1/${folder}/new-${uploadCounter}.jpg`;
      return Promise.resolve({
        id: crypto.randomUUID(),
        public_id: publicIdOf(url),
        url,
      });
    }),
    uploadMultipleFiles: jest
      .fn()
      .mockImplementation((files: unknown[], folder: string) => {
        const list = Array.isArray(files) ? files : [];
        const assets = list.map(() => {
          uploadCounter += 1;
          const url = `https://res.cloudinary.com/mock/upload/v1/${folder}/new-${uploadCounter}.jpg`;
          return { id: crypto.randomUUID(), public_id: publicIdOf(url), url };
        });
        return Promise.resolve(assets);
      }),
    // Trả public_id deterministic theo url để theo dấu chính xác.
    findAssetByUrl: jest.fn().mockImplementation((url: string) => {
      return Promise.resolve({
        id: crypto.randomUUID(),
        public_id: publicIdOf(url),
      });
    }),
    deleteFile: jest.fn().mockImplementation((publicId: string) => {
      deletedPublicIds.push(publicId);
      return Promise.resolve(true);
    }),
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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    jwtService = moduleFixture.get<JwtService>(ACCESS_TOKEN_SERVICE);

    await dataSource
      .getRepository(ProductVariant)
      .delete({ id: Not(IsNull()) });
    await dataSource
      .getRepository(Product)
      .delete({ slug: 'legacy-color-edit-e2e' });
    await dataSource
      .getRepository(User)
      .delete({ email: 'e2e-color-seller@example.com' });
    await dataSource.getRepository(Category).delete({ slug: 'e2e-color-cat' });
    await dataSource
      .getRepository(Category)
      .delete({ slug: 'e2e-color-parent' });

    const hashedPassword = await hashDataHelper('Password123!');
    sellerUser = dataSource.getRepository(User).create({
      username: 'e2ecolorseller',
      email: 'e2e-color-seller@example.com',
      password: hashedPassword,
      role: UserRole.SELLER,
      status: AccountStatus.ACTIVE,
      full_name: 'E2E Color Seller',
    });
    await dataSource.getRepository(User).save(sellerUser);

    sellerShop = dataSource.getRepository(Shop).create({
      seller: sellerUser,
      name: 'E2E Color Shop',
      status: AccountStatus.ACTIVE,
      description: 'E2E color testing shop',
    });
    await dataSource.getRepository(Shop).save(sellerShop);

    const parentCategory = dataSource.getRepository(Category).create({
      name: 'E2E Color Parent',
      slug: 'e2e-color-parent',
    });
    await dataSource.getRepository(Category).save(parentCategory);

    testCategory = dataSource.getRepository(Category).create({
      name: 'E2E Color Category',
      slug: 'e2e-color-cat',
      parent: parentCategory,
    });
    await dataSource.getRepository(Category).save(testCategory);

    sellerToken = await jwtService.signAsync({
      sub: sellerUser.id,
      username: sellerUser.username,
      role: sellerUser.role,
      status: sellerUser.status,
    });
  });

  afterAll(async () => {
    if (dataSource) {
      await dataSource
        .getRepository(ProductVariant)
        .delete({ id: Not(IsNull()) });
      await dataSource
        .getRepository(Product)
        .delete({ slug: 'legacy-color-edit-e2e' });
      await dataSource.getRepository(Shop).delete({ id: sellerShop.id });
      await dataSource.getRepository(User).delete({ id: sellerUser.id });
      await dataSource
        .getRepository(Category)
        .delete({ slug: 'e2e-color-cat' });
      await dataSource
        .getRepository(Category)
        .delete({ slug: 'e2e-color-parent' });
      await dataSource.destroy();
    }
    if (app) {
      await app.close();
    }
  });

  it('edit legacy product via color protocol → giữ nguyên ảnh cũ, KHÔNG xóa asset, migrate sang color_groups', async () => {
    // 1) Seed sản phẩm LEGACY: color_groups=null, ảnh nằm ở variant.images.
    const productRepo = dataSource.getRepository(Product);
    const variantRepo = dataSource.getRepository(ProductVariant);

    const legacyProduct = productRepo.create({
      shop: sellerShop,
      category: testCategory,
      name: 'Legacy Color Edit',
      slug: 'legacy-color-edit-e2e',
      price: 100000,
      weight: 200,
      has_variants: true,
      color_groups: null, // ← LEGACY: chưa có cột màu
      thumbnail_url:
        'https://res.cloudinary.com/mock/upload/v1/thumb-legacy.jpg',
      gallery: [],
      stock_quantity: 15,
    });
    await productRepo.save(legacyProduct);

    // 2 variant cùng màu Đỏ (S/M) dùng CHUNG 1 ảnh legacy (đúng pain point cũ).
    const vS = variantRepo.create({
      product: legacyProduct,
      name: 'Đỏ, S',
      attributes: { color: 'Đỏ', size: 'S' },
      sku: 'LEG-RED-S',
      additional_price: 0,
      stock_quantity: 5,
      images: [LEGACY_RED],
    });
    const vM = variantRepo.create({
      product: legacyProduct,
      name: 'Đỏ, M',
      attributes: { color: 'Đỏ', size: 'M' },
      sku: 'LEG-RED-M',
      additional_price: 0,
      stock_quantity: 10,
      images: [LEGACY_RED],
    });
    await variantRepo.save([vS, vM]);

    deletedPublicIds.length = 0; // reset theo dấu

    // 2) Mô phỏng ĐÚNG payload mà FE edit gửi ở model màu:
    //    - variants: giữ id, KHÔNG kèm existingImages per-variant.
    //    - colorImages: existingImages = ảnh cũ đã prefill từ variant.images.
    const variantsPayload = [
      {
        id: vS.id,
        name: 'Đỏ, S',
        attributes: { color: 'Đỏ', size: 'S' },
        sku: 'LEG-RED-S',
        additional_price: 0,
        stock_quantity: 5,
      },
      {
        id: vM.id,
        name: 'Đỏ, M',
        attributes: { color: 'Đỏ', size: 'M' },
        sku: 'LEG-RED-M',
        additional_price: 0,
        stock_quantity: 10,
      },
    ];
    const colorImagesPayload = [
      { color: 'Đỏ', existingImages: [LEGACY_RED], imageCount: 0 },
    ];

    const response = await request(app.getHttpServer())
      .patch(`/seller/products/${legacyProduct.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .field('name', 'Legacy Color Edit')
      .field('price', '100000')
      .field('weight', '200')
      .field('has_variants', 'true')
      .field('variants', JSON.stringify(variantsPayload))
      .field('colorImages', JSON.stringify(colorImagesPayload));

    if (response.status !== 200) {
      // eslint-disable-next-line no-console
      console.log('LEGACY EDIT FAILED RESP:', response.status, response.body);
    }
    expect(response.status).toBe(200);

    // 3) ASSERT chính: KHÔNG được xóa asset của ảnh legacy vừa migrate.
    expect(deletedPublicIds).not.toContain(publicIdOf(LEGACY_RED));

    // 4) color_groups đã migrate đúng URL cũ (hex null vì legacy không có).
    const data = response.body.data;
    expect(data.color_groups).toEqual({
      Đỏ: { hex: null, images: [LEGACY_RED] },
    });

    // 5) Resolver bơm variant.images từ color_groups (contract giữ nguyên).
    expect(data.variants.length).toBe(2);
    data.variants.forEach((v: { images: string[] }) => {
      expect(v.images).toEqual([LEGACY_RED]);
    });

    // 6) Persist đúng trong DB.
    const reloaded = await productRepo.findOne({
      where: { id: legacyProduct.id },
    });
    expect(reloaded!.color_groups).toEqual({
      Đỏ: { hex: null, images: [LEGACY_RED] },
    });
  });
});
