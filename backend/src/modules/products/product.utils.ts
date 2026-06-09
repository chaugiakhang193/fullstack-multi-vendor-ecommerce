import slugify from 'slugify';

/**
 * Tạo slug SEO-friendly từ tên sản phẩm (hỗ trợ tiếng Việt).
 */
export function generateSlug(name: string): string {
  const slugifyOptions = { lower: true, locale: 'vi' };
  return slugify(name, slugifyOptions);
}

/**
 * Trích xuất UUID từ dạng "slug-i.{uuid}" hoặc trả về nguyên bản nếu là UUID thuần.
 */
export function extractId(idOrSlugWithId: string): string {
  const matchRegex =
    /-i\.([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
  const match = idOrSlugWithId.match(matchRegex);
  if (match) {
    return match[1];
  }
  return idOrSlugWithId; // Trả về nguyên bản nếu là ID thuần túy
}

/**
 * Đảo ngược khoảng giá nếu min > max (Graceful Fallback).
 */
export function normalizePriceRange(
  min?: number,
  max?: number,
): [number | undefined, number | undefined] {
  if (min !== undefined && max !== undefined && min > max) {
    return [max, min];
  }
  return [min, max];
}

/**
 * Phân tích tên biến thể thành object thuộc tính (color, size, ram, storage, cpu...).
 * Hỗ trợ tiếng Việt và tiếng Anh.
 */
export function parseVariantAttributes(name: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const hasNoName = !name;
  if (hasNoName) {
    return attrs;
  }

  // Tách các thuộc tính bằng các ký tự phân tách phổ biến: '-', ',', '/', '|'
  const separatorPattern = /\s*[\-\,\/\|]\s*/;
  const parts = name
    .split(separatorPattern)
    .map((p) => p.trim())
    .filter(Boolean);

  // Danh sách từ điển các màu sắc phổ biến bằng tiếng Việt và tiếng Anh
  const colors = [
    'đen',
    'trắng',
    'đỏ',
    'xanh',
    'vàng',
    'lục',
    'lam',
    'chàm',
    'tím',
    'hồng',
    'xám',
    'cam',
    'nâu',
    'bạc',
    'titan',
    'gold',
    'silver',
    'black',
    'white',
    'red',
    'blue',
    'green',
    'yellow',
    'pink',
    'purple',
    'grey',
    'gray',
    'bạch kim',
    'be',
    'kem',
    'rêu',
    'rêu nhạt',
    'nhám',
    'tự nhiên',
  ];

  // Danh sách các chuẩn kích thước size chữ phổ biến
  const sizes = [
    's',
    'm',
    'l',
    'xl',
    'xxl',
    'xxxl',
    'xs',
    'free size',
    'freesize',
  ];

  const parsePart = (part: string) => {
    const lowerPart = part.toLowerCase();

    // 1. Nhận diện RAM
    const ramPattern = /ram/i;
    const hasRam = lowerPart.includes('ram');
    if (hasRam) {
      const emptyStringFallback = '';
      const ramVal = part.replace(ramPattern, emptyStringFallback).trim();
      attrs['ram'] = ramVal;
      return;
    }

    // 2. Nhận diện CPU / Vi xử lý
    const hasCpu =
      lowerPart.includes('intel') ||
      lowerPart.includes('core') ||
      lowerPart.includes('amd') ||
      lowerPart.includes('ryzen');
    if (hasCpu) {
      attrs['cpu'] = part;
      return;
    }

    // 3. Nhận diện Dung lượng lưu trữ (Storage - GB, TB)
    const storagePattern = /^\d+\s*(gb|tb)$/i;
    const isStorage = storagePattern.test(part);
    if (isStorage) {
      const spacePattern = /\s+/g;
      const emptyStringFallback = '';
      const storageVal = part
        .toUpperCase()
        .replace(spacePattern, emptyStringFallback);
      attrs['storage'] = storageVal;
      return;
    }

    // 4. Nhận diện Kích thước (Size)
    const isSizePrefix = lowerPart.startsWith('size');
    if (isSizePrefix) {
      const sizePattern = /size/i;
      const emptyStringFallback = '';
      const sizeVal = part.replace(sizePattern, emptyStringFallback).trim();
      attrs['size'] = sizeVal;
      return;
    }
    const isSizeViPrefix =
      lowerPart.startsWith('kích thước') || lowerPart.startsWith('kích cỡ');
    if (isSizeViPrefix) {
      const sizeViPattern = /kích thước|kích cỡ/i;
      const emptyStringFallback = '';
      const sizeVal = part.replace(sizeViPattern, emptyStringFallback).trim();
      attrs['size'] = sizeVal;
      return;
    }
    const isStandardSizeWord = sizes.includes(lowerPart);
    if (isStandardSizeWord) {
      const normalizedSizeVal = part.toUpperCase();
      attrs['size'] = normalizedSizeVal;
      return;
    }
    // Nhận dạng size số (ví dụ size giày hoặc quần áo chuẩn Việt Nam từ 28 đến 48)
    const numberPattern = /^\d+$/;
    const isNumberOnly = numberPattern.test(part);
    if (isNumberOnly) {
      const radixVal = 10;
      const num = parseInt(part, radixVal);
      const isShoeSize = num >= 28 && num <= 48;
      if (isShoeSize) {
        attrs['size'] = part;
        return;
      }
    }

    // 5. Nhận diện Màu sắc (Color)
    const isColorPrefix = lowerPart.startsWith('màu ');
    if (isColorPrefix) {
      const colorPrefixPattern = /màu /i;
      const emptyStringFallback = '';
      let colorVal = part
        .replace(colorPrefixPattern, emptyStringFallback)
        .trim();

      // Loại bỏ các từ hậu tố mô tả đi kèm
      const descriptive1 = / cá tính/i;
      const descriptive2 = / thanh lịch/i;
      const descriptive3 = / sang trọng/i;
      colorVal = colorVal
        .replace(descriptive1, emptyStringFallback)
        .replace(descriptive2, emptyStringFallback)
        .replace(descriptive3, emptyStringFallback)
        .trim();
      attrs['color'] = colorVal;
      return;
    }

    // Đối chiếu kiểm tra với từ điển màu sắc
    const colorMatchFn = (c: string) => lowerPart.includes(c);
    const matchedColor = colors.find(colorMatchFn);
    if (matchedColor) {
      let colorVal = part;
      const startsWithColorVi = colorVal.toLowerCase().startsWith('màu ');
      if (startsWithColorVi) {
        const colorPrefixPattern = /màu /i;
        const emptyStringFallback = '';
        colorVal = colorVal
          .replace(colorPrefixPattern, emptyStringFallback)
          .trim();
      }
      attrs['color'] = colorVal;
      return;
    }
  };

  for (const part of parts) {
    parsePart(part);
  }

  return attrs;
}
