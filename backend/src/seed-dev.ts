import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { Shop } from '@/modules/shops/entities/shop.entity';
import { Category } from '@/modules/products/entities/category.entity';
import { Product } from '@/modules/products/entities/product.entity';
import { ProductVariant } from '@/modules/products/entities/product-variant.entity';
import { AccountStatus, ProductStatus, UserRole } from '@/modules/enums';
import { hashDataHelper } from '@/common/helpers/utils';

async function seed() {
  console.log('====== BẮT ĐẦU GIEO HẠT DỮ LIỆU PHÁT TRIỂN (DEV SEEDER) ======');

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  const userRepository = dataSource.getRepository(User);
  const shopRepository = dataSource.getRepository(Shop);
  const categoryRepository = dataSource.getRepository(Category);
  const productRepository = dataSource.getRepository(Product);
  const variantRepository = dataSource.getRepository(ProductVariant);

  try {
    // A. DỌN DẸP DỮ LIỆU CŨ (Để giữ DB luôn sạch và tránh lỗi trùng lặp khi chạy lại)
    console.log('-> Đang dọn dẹp các tài khoản dev cũ...');
    const emailsToClean = ['seller_dev@example.com', 'Shopprovip1@gmail.com'];
    for (const emailToClean of emailsToClean) {
      const oldUser = await userRepository.findOne({
        where: { email: emailToClean },
      });
      if (oldUser) {
        const oldShop = await shopRepository.findOne({
          where: { seller: { id: oldUser.id } },
        });
        if (oldShop) {
          const oldProducts = await productRepository.find({
            where: { shop: { id: oldShop.id } },
          });
          for (const p of oldProducts) {
            await variantRepository.delete({ product: { id: p.id } });
          }
          await productRepository.delete({ shop: { id: oldShop.id } });
          await shopRepository.delete({ id: oldShop.id });
        }
        await userRepository.delete({ id: oldUser.id });
      }
    }

    // 1. Kiểm tra / Tạo User Seller Mới
    console.log('-> Tạo mới tài khoản Seller Shopprovip1@gmail.com...');
    const hashedPassword = await hashDataHelper('Shopprovip1@gmail.com');
    const devSeller = userRepository.create({
      username: 'shopprovip1',
      email: 'Shopprovip1@gmail.com',
      password: hashedPassword,
      role: UserRole.SELLER,
      status: AccountStatus.ACTIVE,
      full_name: 'Shop Pro Vip 1',
      phone: '0987654321',
    });
    await userRepository.save(devSeller);

    // 2. Kiểm tra / Tạo Cây Danh Mục Mẫu
    console.log('-> Đang xử lý danh mục...');
    let fashionCategory = await categoryRepository.findOne({
      where: { slug: 'thoi-trang' },
    });
    if (!fashionCategory) {
      fashionCategory = categoryRepository.create({
        name: 'Thời Trang',
        slug: 'thoi-trang',
        parent: null,
      });
      await categoryRepository.save(fashionCategory);
    }

    let shirtCategory = await categoryRepository.findOne({
      where: { slug: 'ao-thun-nam' },
    });
    if (!shirtCategory) {
      shirtCategory = categoryRepository.create({
        name: 'Áo Thun Nam',
        slug: 'ao-thun-nam',
        parent: fashionCategory,
      });
      await categoryRepository.save(shirtCategory);
    }

    let jeanCategory = await categoryRepository.findOne({
      where: { slug: 'quan-jean-nam' },
    });
    if (!jeanCategory) {
      jeanCategory = categoryRepository.create({
        name: 'Quần Jean Nam',
        slug: 'quan-jean-nam',
        parent: fashionCategory,
      });
      await categoryRepository.save(jeanCategory);
    }

    let techCategory = await categoryRepository.findOne({
      where: { slug: 'dien-tu' },
    });
    if (!techCategory) {
      techCategory = categoryRepository.create({
        name: 'Điện Tử',
        slug: 'dien-tu',
        parent: null,
      });
      await categoryRepository.save(techCategory);
    }

    let phoneCategory = await categoryRepository.findOne({
      where: { slug: 'dien-thoai' },
    });
    if (!phoneCategory) {
      phoneCategory = categoryRepository.create({
        name: 'Điện Thoại',
        slug: 'dien-thoai',
        parent: techCategory,
      });
      await categoryRepository.save(phoneCategory);
    }

    // 3. Tạo Cửa Hàng (Shop)
    console.log('-> Tạo mới Shop...');
    let devShop = await shopRepository.findOne({
      where: { seller: { id: devSeller.id } },
    });
    if (!devShop) {
      devShop = shopRepository.create({
        seller: devSeller,
        name: 'Vũ Trụ Thời Trang - Dev Store',
        description:
          'Cửa hàng mô phỏng phục vụ quá trình phát triển Fullstack Web. Đầy đủ quần áo, phụ kiện cao cấp.',
        logo_url:
          'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=300',
        banner_url:
          'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200',
        status: AccountStatus.ACTIVE,
        pickup_address: '123 Đường Láng, Láng Thượng, Đống Đa, Hà Nội',
        bank_account_info: JSON.stringify({
          bank_name: 'Techcombank',
          bank_account_number: '190345678910',
          bank_account_name: 'NGUYEN VAN A',
        }),
      });
      await shopRepository.save(devShop);
    } else {
      devShop.status = AccountStatus.ACTIVE;
      await shopRepository.save(devShop);
    }

    // 4. Tạo Sản Phẩm Mẫu (Products & Variants)
    console.log('-> Đang gieo hạt danh sách sản phẩm mẫu...');

    // Product 1: Áo Thun Polo Nam Premium (Có Biến Thể)
    let poloProduct = productRepository.create({
      shop: devShop,
      name: 'Áo Thun Polo Nam Premium',
      slug: 'ao-thun-polo-nam-premium-' + Date.now().toString().slice(-4),
      sku: 'POLO-PREMIUM',
      description:
        'Áo thun Polo chất liệu Cotton cá sấu 100% tự nhiên siêu thoáng khí, phom dáng Slim-fit tôn dáng lịch lãm, phù hợp mặc đi làm, đi chơi hay hoạt động thể thao nhẹ nhàng.',
      price: 250000,
      weight: 220,
      length: 15,
      width: 10,
      height: 5,
      category: shirtCategory,
      thumbnail_url:
        'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=800',
      gallery: [
        'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800',
        'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800',
      ],
      has_variants: true,
      status: ProductStatus.ACTIVE,
      stock_quantity: 85,
    });
    poloProduct = await productRepository.save(poloProduct);

    const v1 = variantRepository.create({
      product: poloProduct,
      name: 'Màu Đen - Size M',
      sku: 'POLO-BLACK-M',
      additional_price: 0,
      stock_quantity: 50,
      images: [
        'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=800',
      ],
    });

    const v2 = variantRepository.create({
      product: poloProduct,
      name: 'Màu Đỏ - Size L',
      sku: 'POLO-RED-L',
      additional_price: 15000,
      stock_quantity: 35,
      images: [
        'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=800',
      ],
    });
    await variantRepository.save([v1, v2]);

    // Product 2: Quần Jean Slimfit Nam (Không Biến Thể)
    const jeanProduct = productRepository.create({
      shop: devShop,
      name: 'Quần Jean Slimfit Nam Co Giãn Cực Tốt',
      slug: 'quan-jean-slimfit-nam-co-gian-' + Date.now().toString().slice(-4),
      sku: 'JEAN-SLIMFIT',
      description:
        'Quần jean chất liệu cao cấp co giãn 4 chiều mang lại cảm giác thoải mái khi di chuyển. Màu sắc chàm Indigo thời thượng, không phai màu khi giặt.',
      price: 390000,
      weight: 450,
      length: 30,
      width: 20,
      height: 8,
      category: jeanCategory,
      thumbnail_url:
        'https://images.unsplash.com/photo-1542272604-787c3835535d?w=800',
      gallery: [
        'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=800',
      ],
      has_variants: false,
      stock_quantity: 120,
      status: ProductStatus.ACTIVE,
    });
    await productRepository.save(jeanProduct);

    // Product 3: Điện Thoại Apollo 15 Pro (Có Biến Thể)
    let phoneProduct = productRepository.create({
      shop: devShop,
      name: 'Điện Thoại Flagship Apollo 15 Pro',
      slug:
        'dien-thoai-flagship-apollo-15-pro-' + Date.now().toString().slice(-4),
      sku: 'APOLLO-15-PRO',
      description:
        'Siêu phẩm công nghệ Apollo 15 Pro với camera 200MP zoom quang học 10x, màn hình LTPO OLED 120Hz siêu mượt và vi xử lý TensorX thế hệ mới siêu tiết kiệm pin.',
      price: 24990000,
      weight: 198,
      length: 16,
      width: 8,
      height: 2,
      category: phoneCategory,
      thumbnail_url:
        'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800',
      gallery: [
        'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=800',
      ],
      has_variants: true,
      status: ProductStatus.ACTIVE,
      stock_quantity: 25,
    });
    phoneProduct = await productRepository.save(phoneProduct);

    const vPhone1 = variantRepository.create({
      product: phoneProduct,
      name: '256GB - Màu Titan Tự Nhiên',
      sku: 'APOLLO-TITAN-256',
      additional_price: 0,
      stock_quantity: 15,
      images: [
        'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800',
      ],
    });

    const vPhone2 = variantRepository.create({
      product: phoneProduct,
      name: '512GB - Màu Đen Nhám',
      sku: 'APOLLO-BLACK-512',
      additional_price: 3500000,
      stock_quantity: 10,
      images: [
        'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=800',
      ],
    });
    await variantRepository.save([vPhone1, vPhone2]);

    // Product 4: Áo Khoác Gió Bomber Waterproof (Không Biến Thể)
    const bomberProduct = productRepository.create({
      shop: devShop,
      name: 'Áo Khoác Gió Bomber Nam Waterproof',
      slug: 'ao-khoac-gio-bomber-nam-' + Date.now().toString().slice(-4),
      sku: 'BOMBER-WATERPROOF',
      description:
        'Áo khoác gió bomber phom dáng năng động với lớp vải ngoài trượt nước thông minh, chống gió bụi tối ưu. Phù hợp cho những ngày se lạnh hoặc thời tiết giao mùa.',
      price: 320000,
      weight: 350,
      length: 20,
      width: 15,
      height: 5,
      category: shirtCategory,
      thumbnail_url:
        'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800',
      gallery: [
        'https://images.unsplash.com/photo-1495105787522-5334e3ffa0ef?w=800',
      ],
      has_variants: false,
      stock_quantity: 45,
      status: ProductStatus.ACTIVE,
    });
    await productRepository.save(bomberProduct);

    console.log('====== GIEO HẠT THÀNH CÔNG RỒI NHA BẠN ƠI! ======');
    console.log('Tài khoản Seller của bạn:');
    console.log(' - Email: Shopprovip1@gmail.com');
    console.log(' - Mật khẩu: Shopprovip1@gmail.com');
    console.log(
      'Đã tạo 1 Shop, 4 Sản phẩm mẫu đỉnh cao kèm 4 Biến thể cực kỳ chi tiết!',
    );
  } catch (error) {
    console.error('Lỗi khi gieo hạt dữ liệu:', error);
  } finally {
    await app.close();
  }
}

seed();
