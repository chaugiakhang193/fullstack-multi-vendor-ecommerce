import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { DataSource } from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { Shop } from '@/modules/shops/entities/shop.entity';
import { Category } from '@/modules/products/entities/category.entity';
import { Product } from '@/modules/products/entities/product.entity';
import { ProductVariant } from '@/modules/products/entities/product-variant.entity';
import { AccountStatus, ProductStatus, UserRole } from '@/common/enums';
import { hashDataHelper } from '@/common/helpers/utils';

async function seed() {
  console.log(
    '====== BẮT ĐẦU GIEO HẠT DỮ LIỆU PHÁT TRIỂN (DEV SEEDER - 80 PRODUCTS) ======',
  );

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  const userRepository = dataSource.getRepository(User);
  const shopRepository = dataSource.getRepository(Shop);
  const categoryRepository = dataSource.getRepository(Category);
  const productRepository = dataSource.getRepository(Product);
  const variantRepository = dataSource.getRepository(ProductVariant);

  try {
    // A. DỌN DẸP DỮ LIỆU CŨ
    console.log('-> Đang dọn dẹp các dữ liệu cũ của cửa hàng dev...');
    const emailsToClean = [
      'Shopprovip1@gmail.com',
      'seller_dev@example.com',
      'seller2_dev@example.com',
      'buyer_dev@example.com',
    ];
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

    // 1. Tạo Users Mới (Sellers & Buyer)
    console.log('-> Tạo mới tài khoản Seller 1 (Shopprovip1@gmail.com)...');
    const hashedPassword1 = await hashDataHelper('Shopprovip1@gmail.com');
    const devSeller = userRepository.create({
      username: 'shopprovip1',
      email: 'Shopprovip1@gmail.com',
      password: hashedPassword1,
      role: UserRole.SELLER,
      status: AccountStatus.ACTIVE,
      full_name: 'Shop Pro Vip 1',
      phone: '0987654321',
    });
    await userRepository.save(devSeller);

    console.log('-> Tạo mới tài khoản Seller 2 (seller2_dev@example.com)...');
    const hashedPassword2 = await hashDataHelper('seller2_dev@example.com');
    const devSeller2 = userRepository.create({
      username: 'seller2_dev',
      email: 'seller2_dev@example.com',
      password: hashedPassword2,
      role: UserRole.SELLER,
      status: AccountStatus.ACTIVE,
      full_name: 'Shop Dev 2 Seller',
      phone: '0987654322',
    });
    await userRepository.save(devSeller2);

    console.log(
      '-> Tạo mới tài khoản Customer/Buyer (buyer_dev@example.com)...',
    );
    const hashedPassword3 = await hashDataHelper('buyer_dev@example.com');
    const devBuyer = userRepository.create({
      username: 'buyer_dev',
      email: 'buyer_dev@example.com',
      password: hashedPassword3,
      role: UserRole.CUSTOMER,
      status: AccountStatus.ACTIVE,
      full_name: 'Buyer Dev Account',
      phone: '0987654323',
    });
    await userRepository.save(devBuyer);

    // 2. Tạo Cây Danh Mục Mẫu
    console.log('-> Đang xử lý danh mục...');

    // THỜI TRANG & CON
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

    let shoeCategory = await categoryRepository.findOne({
      where: { slug: 'giay-the-thao' },
    });
    if (!shoeCategory) {
      shoeCategory = categoryRepository.create({
        name: 'Giày Thể Thao',
        slug: 'giay-the-thao',
        parent: fashionCategory,
      });
      await categoryRepository.save(shoeCategory);
    }

    // ĐIỆN TỬ & CON
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

    let laptopCategory = await categoryRepository.findOne({
      where: { slug: 'laptop' },
    });
    if (!laptopCategory) {
      laptopCategory = categoryRepository.create({
        name: 'Laptop',
        slug: 'laptop',
        parent: techCategory,
      });
      await categoryRepository.save(laptopCategory);
    }

    let accessoryCategory = await categoryRepository.findOne({
      where: { slug: 'phu-kien-cong-nghe' },
    });
    if (!accessoryCategory) {
      accessoryCategory = categoryRepository.create({
        name: 'Phụ Kiện Công Nghệ',
        slug: 'phu-kien-cong-nghe',
        parent: techCategory,
      });
      await categoryRepository.save(accessoryCategory);
    }

    // 3. Tạo Shop 1 & Shop 2
    console.log('-> Tạo mới Shop 1...');
    const devShop = shopRepository.create({
      seller: devSeller,
      name: 'Vũ Trụ Thời Trang & Công Nghệ - Dev Store',
      description:
        'Cửa hàng mô phỏng phục vụ quá trình phát triển Fullstack Web. Cung cấp thời trang cao cấp và đồ công nghệ sành điệu.',
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

    console.log('-> Tạo mới Shop 2...');
    const devShop2 = shopRepository.create({
      seller: devSeller2,
      name: 'Thế Giới Phụ Kiện & Điện Máy - Dev Store 2',
      description:
        'Cửa hàng thứ hai phục vụ kiểm thử giỏ hàng liên shop (multi-shop cart) và các tính năng nâng cao.',
      logo_url:
        'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=300',
      banner_url:
        'https://images.unsplash.com/photo-1468436139062-f60a71c5c892?w=1200',
      status: AccountStatus.ACTIVE,
      pickup_address: '456 Đường Nguyễn Trãi, Thanh Xuân, Hà Nội',
      bank_account_info: JSON.stringify({
        bank_name: 'Vietcombank',
        bank_account_number: '1902222333444',
        bank_account_name: 'NGUYEN VAN B',
      }),
    });
    await shopRepository.save(devShop2);

    // 4. Định nghĩa danh sách các mẫu sản phẩm
    console.log('-> Đang sinh dữ liệu sản phẩm...');
    const productTemplates: Array<{
      name: string;
      description: string;
      price: number;
      weight: number;
      category: Category;
      thumbnail: string;
      gallery: string[];
      hasVariants: boolean;
      isHidden?: boolean;
      shop?: Shop;
      stockQuantity?: number;
      variants?: Array<{
        name: string;
        skuSuffix: string;
        priceDiff: number;
        stock: number;
        images: string[];
      }>;
    }> = [];

    // --- A. THỜI TRANG - ÁO THUN NAM (15 sản phẩm) ---
    const shirtImages = [
      'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800',
      'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800',
      'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=800',
      'https://images.unsplash.com/photo-1562157873-818bc0726f68?w=800',
      'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=800',
    ];

    for (let i = 1; i <= 15; i++) {
      const isEven = i % 2 === 0;
      const basePrice = 150000 + i * 12000;
      productTemplates.push({
        name: `Áo Thun Nam Cổ Tròn Cotton ${i === 1 ? 'Premium' : i === 2 ? 'Oversized' : `Basic V${i}`}`,
        description: `Áo thun nam được làm từ 100% chất liệu cotton organic mềm mại, co giãn 4 chiều cực kỳ mát mẻ và thấm hút mồ hôi tốt. Kiểu dáng năng động trẻ trung phù hợp mặc đi học, đi chơi hay ở nhà. Bản nâng cấp thế hệ ${i}.`,
        price: basePrice,
        weight: 200,
        category: shirtCategory,
        thumbnail: shirtImages[i % shirtImages.length],
        gallery: [
          shirtImages[(i + 1) % shirtImages.length],
          shirtImages[(i + 2) % shirtImages.length],
        ],
        hasVariants: isEven,
        variants: isEven
          ? [
              {
                name: 'Màu Đen - Size M',
                skuSuffix: 'BLK-M',
                priceDiff: 0,
                stock: 30,
                images: [shirtImages[i % shirtImages.length]],
              },
              {
                name: 'Màu Đen - Size L',
                skuSuffix: 'BLK-L',
                priceDiff: 10000,
                stock: 40,
                images: [shirtImages[i % shirtImages.length]],
              },
              {
                name: 'Màu Trắng - Size M',
                skuSuffix: 'WHT-M',
                priceDiff: 0,
                stock: 25,
                images: [shirtImages[(i + 1) % shirtImages.length]],
              },
              {
                name: 'Màu Trắng - Size L',
                skuSuffix: 'WHT-L',
                priceDiff: 10000,
                stock: 35,
                images: [shirtImages[(i + 1) % shirtImages.length]],
              },
            ]
          : undefined,
      });
    }

    // --- B. THỜI TRANG - QUẦN JEAN NAM (15 sản phẩm) ---
    const jeanImages = [
      'https://images.unsplash.com/photo-1542272604-787c3835535d?w=800',
      'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=800',
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800',
      'https://images.unsplash.com/photo-1475178626620-a4d074967452?w=800',
    ];

    for (let i = 1; i <= 15; i++) {
      const isOdd = i % 2 !== 0;
      const basePrice = 300000 + i * 15000;
      productTemplates.push({
        name: `Quần Jean Nam Slimfit Cao Cấp ${i === 1 ? 'Chàm Denim' : i === 2 ? 'Rách Gối Cá Tính' : `Style ${i}`}`,
        description: `Quần jean nam được hoàn thiện tinh xảo từ chất vải denim dày dặn, co giãn nhẹ giúp bạn thoải mái vận động cả ngày dài. Khóa kéo đồng chắc chắn, đường may tỉ mỉ bền đẹp theo thời gian. Mẫu mới nhất của năm.`,
        price: basePrice,
        weight: 450,
        category: jeanCategory,
        thumbnail: jeanImages[i % jeanImages.length],
        gallery: [jeanImages[(i + 1) % jeanImages.length]],
        hasVariants: isOdd,
        variants: isOdd
          ? [
              {
                name: 'Size 29',
                skuSuffix: 'SZ29',
                priceDiff: 0,
                stock: 15,
                images: [jeanImages[i % jeanImages.length]],
              },
              {
                name: 'Size 30',
                skuSuffix: 'SZ30',
                priceDiff: 0,
                stock: 20,
                images: [jeanImages[i % jeanImages.length]],
              },
              {
                name: 'Size 31',
                skuSuffix: 'SZ31',
                priceDiff: 15000,
                stock: 25,
                images: [jeanImages[i % jeanImages.length]],
              },
              {
                name: 'Size 32',
                skuSuffix: 'SZ32',
                priceDiff: 15000,
                stock: 15,
                images: [jeanImages[i % jeanImages.length]],
              },
            ]
          : undefined,
      });
    }

    // --- C. THỜI TRANG - GIÀY THỂ THAO (15 sản phẩm) ---
    const shoeImages = [
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800',
      'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800',
      'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800',
      'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800',
      'https://images.unsplash.com/photo-1582588678413-dbf45f4823e9?w=800',
    ];

    for (let i = 1; i <= 15; i++) {
      const hasVar = i % 3 === 0;
      const basePrice = 450000 + i * 25000;
      productTemplates.push({
        name: `Giày Thể Thao Sneaker Nam ${i === 1 ? 'Running Pro' : i === 2 ? 'Streetwear V2' : `Comfort V${i}`}`,
        description: `Giày thể thao nam siêu nhẹ nâng đỡ bàn chân tối ưu khi di chuyển. Đế cao su nguyên chất chống trơn trượt hiệu quả, lớp lót êm ái thoáng khí không gây mùi khó chịu. Hoàn hảo cho đi bộ, chạy bộ và tập gym.`,
        price: basePrice,
        weight: 600,
        category: shoeCategory,
        thumbnail: shoeImages[i % shoeImages.length],
        gallery: [
          shoeImages[(i + 1) % shoeImages.length],
          shoeImages[(i + 2) % shoeImages.length],
        ],
        hasVariants: hasVar,
        variants: hasVar
          ? [
              {
                name: 'Kích thước 40',
                skuSuffix: 'SZ40',
                priceDiff: 0,
                stock: 10,
                images: [shoeImages[i % shoeImages.length]],
              },
              {
                name: 'Kích thước 41',
                skuSuffix: 'SZ41',
                priceDiff: 0,
                stock: 12,
                images: [shoeImages[i % shoeImages.length]],
              },
              {
                name: 'Kích thước 42',
                skuSuffix: 'SZ42',
                priceDiff: 20000,
                stock: 15,
                images: [shoeImages[i % shoeImages.length]],
              },
              {
                name: 'Kích thước 43',
                skuSuffix: 'SZ43',
                priceDiff: 20000,
                stock: 8,
                images: [shoeImages[i % shoeImages.length]],
              },
            ]
          : undefined,
      });
    }

    // --- D. ĐIỆN TỬ - ĐIỆN THOẠI (10 sản phẩm) ---
    const phoneImages = [
      'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800',
      'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=800',
      'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=800',
      'https://images.unsplash.com/photo-1565849906660-4469279f555e?w=800',
    ];

    for (let i = 1; i <= 10; i++) {
      const hasVar = i % 2 === 0;
      const basePrice = 5000000 + i * 2000000;
      productTemplates.push({
        name: `Điện Thoại Thông Minh ${i === 1 ? 'Zeus 24 Ultra' : i === 2 ? 'Ares Neo Pro' : `Athena Smart V${i}`}`,
        description: `Trải nghiệm cấu hình siêu khủng với vi xử lý thế hệ mới, màn hình 120Hz mượt mà và hệ thống camera AI chụp ảnh sắc nét ngay cả trong bóng tối. Thiết kế nguyên khối sang trọng, pin dung lượng lớn sạc siêu nhanh 67W.`,
        price: basePrice,
        weight: 200,
        category: phoneCategory,
        thumbnail: phoneImages[i % phoneImages.length],
        gallery: [phoneImages[(i + 1) % phoneImages.length]],
        hasVariants: hasVar,
        variants: hasVar
          ? [
              {
                name: '128GB - Đen Nhám',
                skuSuffix: '128GB-BLK',
                priceDiff: 0,
                stock: 10,
                images: [phoneImages[i % phoneImages.length]],
              },
              {
                name: '256GB - Đen Nhám',
                skuSuffix: '256GB-BLK',
                priceDiff: 1500000,
                stock: 15,
                images: [phoneImages[i % phoneImages.length]],
              },
              {
                name: '256GB - Titan Tự Nhiên',
                skuSuffix: '256GB-TTN',
                priceDiff: 1800000,
                stock: 8,
                images: [phoneImages[(i + 1) % phoneImages.length]],
              },
            ]
          : undefined,
      });
    }

    // --- E. ĐIỆN TỬ - LAPTOP (10 sản phẩm) ---
    const laptopImages = [
      'https://images.unsplash.com/photo-1496181130204-755241524eab?w=800',
      'https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=800',
      'https://images.unsplash.com/photo-1484788984921-03950022c9ef?w=800',
      'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=800',
    ];

    for (let i = 1; i <= 10; i++) {
      const hasVar = i % 2 !== 0;
      const basePrice = 12000000 + i * 3000000;
      productTemplates.push({
        name: `Laptop ${i === 1 ? 'ZenBook Slim 14' : i === 2 ? 'Legion Gaming X' : `Inspi-Book V${i}`}`,
        description: `Laptop hiệu năng cao đáp ứng trọn vẹn từ công việc văn phòng, học tập cho đến đồ họa chuyên nghiệp và chiến game mượt mà. Màn hình độ phân giải cao màu sắc chân thực, viền siêu mỏng thời thượng.`,
        price: basePrice,
        weight: 1600,
        category: laptopCategory,
        thumbnail: laptopImages[i % laptopImages.length],
        gallery: [laptopImages[(i + 1) % laptopImages.length]],
        hasVariants: hasVar,
        variants: hasVar
          ? [
              {
                name: 'Intel Core i5 - 8GB RAM',
                skuSuffix: 'I5-8G',
                priceDiff: 0,
                stock: 5,
                images: [laptopImages[i % laptopImages.length]],
              },
              {
                name: 'Intel Core i7 - 16GB RAM',
                skuSuffix: 'I7-16G',
                priceDiff: 3500000,
                stock: 8,
                images: [laptopImages[(i + 1) % laptopImages.length]],
              },
            ]
          : undefined,
      });
    }

    // --- F. ĐIỆN TỬ - PHỤ KIỆN CÔNG NGHỆ (15 sản phẩm) ---
    const accImages = [
      'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800',
      'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=800',
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800',
      'https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?w=800',
      'https://images.unsplash.com/photo-1610461888750-10bfc601b874?w=800',
    ];

    for (let i = 1; i <= 15; i++) {
      const hasVar = i % 3 === 0;
      const basePrice = 200000 + i * 35000;
      productTemplates.push({
        name: `Phụ Kiện ${i === 1 ? 'Tai Nghe True Wireless Bluetooth' : i === 2 ? 'Sạc Dự Phòng Siêu Nhanh 20000mAh' : `Smart Gadget ${i}`}`,
        description: `Thiết bị phụ kiện chất lượng cao giúp tối ưu hóa cuộc sống công nghệ của bạn. Chất liệu bền bỉ, tính năng thông minh vượt trội, tương thích tốt với hầu hết các thiết bị di động trên thị trường.`,
        price: basePrice,
        weight: 150,
        category: accessoryCategory,
        thumbnail: accImages[i % accImages.length],
        gallery: [accImages[(i + 1) % accImages.length]],
        hasVariants: hasVar,
        shop: devShop2, // Assign these to Shop 2!
        variants: hasVar
          ? [
              {
                name: 'Màu Đen cá tính',
                skuSuffix: 'BLK',
                priceDiff: 0,
                stock: 50,
                images: [accImages[i % accImages.length]],
              },
              {
                name: 'Màu Trắng thanh lịch',
                skuSuffix: 'WHT',
                priceDiff: 0,
                stock: 45,
                images: [accImages[(i + 1) % accImages.length]],
              },
            ]
          : undefined,
      });
    }

    // --- G. SẢN PHẨM PHỤ VỤ KIỂM THỬ GIỎ HÀNG (Cart Test Products) ---
    // 1. Sản phẩm không variant, số lượng tồn kho rất ít (ví dụ: 2) để test Qty > stock
    productTemplates.push({
      name: 'Sản Phẩm Test Ít Kho (Stock = 2)',
      description: 'Sản phẩm phục vụ test thêm giỏ hàng vượt số lượng tồn kho.',
      price: 99000,
      weight: 100,
      category: accessoryCategory,
      thumbnail: accImages[0],
      gallery: [],
      hasVariants: false,
      stockQuantity: 2,
      shop: devShop,
    });

    // 2. Sản phẩm bị ẩn (is_hidden = true)
    productTemplates.push({
      name: 'Sản Phẩm Test Bị Ẩn (Hidden)',
      description: 'Sản phẩm đã bị ẩn bởi người bán.',
      price: 150000,
      weight: 100,
      category: accessoryCategory,
      thumbnail: accImages[1],
      gallery: [],
      hasVariants: false,
      isHidden: true,
      shop: devShop,
    });

    // 5. Ghi nhận tất cả sản phẩm và biến thể vào CSDL
    console.log(`-> Tổng số sản phẩm dự kiến tạo: ${productTemplates.length}`);
    let seededCount = 0;
    let variantCount = 0;

    for (const temp of productTemplates) {
      const baseSku = `DEV-${temp.category.slug.toUpperCase()}-${seededCount + 1}`;
      const slugName =
        temp.name
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, '-') +
        '-' +
        Math.random().toString(36).substring(2, 6);

      const product = productRepository.create({
        shop: temp.shop || devShop,
        name: temp.name,
        slug: slugName,
        sku: baseSku,
        description: temp.description,
        price: temp.price,
        weight: temp.weight,
        length: 20,
        width: 15,
        height: 10,
        category: temp.category,
        thumbnail_url: temp.thumbnail,
        gallery: temp.gallery,
        has_variants: temp.hasVariants,
        is_hidden: temp.isHidden || false,
        stock_quantity: temp.hasVariants
          ? temp.variants!.reduce((acc, v) => acc + v.stock, 0)
          : temp.stockQuantity !== undefined
            ? temp.stockQuantity
            : Math.floor(Math.random() * 80) + 20,
        status: ProductStatus.ACTIVE,
      });

      const savedProduct = await productRepository.save(product);
      seededCount++;

      if (temp.hasVariants && temp.variants) {
        const variantsToSave = temp.variants.map((v) => {
          variantCount++;
          return variantRepository.create({
            product: savedProduct,
            name: v.name,
            sku: `${baseSku}-${v.skuSuffix}`,
            additional_price: v.priceDiff,
            stock_quantity: v.stock,
            images: v.images,
          });
        });
        await variantRepository.save(variantsToSave);
      }
    }

    console.log('====== GIEO HẠT THÀNH CÔNG RỒI NHA BẠN ƠI! ======');
    console.log('Tài khoản Test của bạn:');
    console.log('1. Seller 1 (Shop 1 - Vũ Trụ Thời Trang & Công Nghệ):');
    console.log('   - Email: Shopprovip1@gmail.com');
    console.log('   - Mật khẩu: Shopprovip1@gmail.com');
    console.log('2. Seller 2 (Shop 2 - Thế Giới Phụ Kiện & Điện Máy):');
    console.log('   - Email: seller2_dev@example.com');
    console.log('   - Mật khẩu: seller2_dev@example.com');
    console.log('3. Customer/Buyer (Tài khoản người mua):');
    console.log('   - Email: buyer_dev@example.com');
    console.log('   - Mật khẩu: buyer_dev@example.com');
    console.log(
      `Đã tạo thành công ${seededCount} sản phẩm và ${variantCount} biến thể kèm ảnh đẹp mắt!`,
    );
  } catch (error) {
    console.error('Lỗi khi gieo hạt dữ liệu:', error);
  } finally {
    await app.close();
  }
}

seed();
