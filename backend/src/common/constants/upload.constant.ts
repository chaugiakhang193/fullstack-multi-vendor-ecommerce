import { PRODUCT_LIMITS, SHOP_LIMITS } from '@/common/limits';

export const UPLOAD_LIMITS = {
  PRODUCT: {
    MAX_THUMBNAILS: 1,
    MAX_GALLERY_IMAGES: 5,
    MAX_VARIANT_IMAGES: PRODUCT_LIMITS.VARIANT.MAX_IMAGES,
    MAX_VARIANT_FILES_BATCH: 30,
  },
  SHOP: {
    MAX_LOGOS: 1,
    MAX_BANNERS: 1,
    MAX_GALLERY_IMAGES: SHOP_LIMITS.GALLERY.MAX_IMAGES,
  },
} as const;

export const CLOUDINARY_FOLDER = {
  SHOP_LOGOS: 'shop/logos',
  SHOP_BANNERS: 'shop/banners',
  SHOP_GALLERIES: 'shop/galleries',
  PRODUCT_THUMBNAILS: 'products/thumbnails',
  PRODUCT_GALLERY: 'products/gallery',
  PRODUCT_VARIANTS: 'products/variants',
  USER_AVATARS: 'user_avatars',
} as const;
