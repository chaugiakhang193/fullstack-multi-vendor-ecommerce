'use client'; // Chạy dưới dạng Client Component để xử lý logic tương tác trên trình duyệt

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useDropzone } from 'react-dropzone'; // Thư viện kéo thả file
import { toast } from 'sonner'; // Thông báo dạng pop-up
import {
  Plus,
  Trash2,
  Loader2,
  ImageIcon,
  ChevronLeft,
  Package,
  X,
  Save,
} from 'lucide-react'; // Bộ biểu tượng SVG

import sellerProductsApiRequest from '@/apiRequests/products/seller-products'; // API liên quan đến seller
import categoriesApiRequest from '@/apiRequests/products/categories'; // API liên quan đến danh mục
import { CategoryResponseType } from '@/schemaValidations/products/categories.schema';
import { getErrorMessage } from '@/lib/http';
import { ProductResponseType } from '@/schemaValidations/products/products.schema';
import { ProductModerationBanner } from '@/components/products/product-moderation-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldLabel, FieldError } from '@/components/ui/field';

// 1 dòng phân loại-2 trong 1 màu (giữ id biến thể cũ để không tạo trùng khi lưu)
type EditColorOptionItem = {
  id?: string; // ID biến thể cũ (nếu đã tồn tại trên DB) — giữ lại để UPDATE đúng
  value: string; // "L" | "4gb"
  sku: string;
  additional_price: number;
  stock_quantity: number;
};

// 1 nhóm màu: ảnh cũ giữ lại + ảnh mới + hex (optional) + danh sách phân loại-2 (ragged)
type EditColorGroupItem = {
  color: string;
  hex: string; // mã màu, '' = chưa chọn
  existingImages: string[]; // URL ảnh màu cũ giữ lại
  newImages: File[]; // File ảnh mới thêm ở phiên này
  newImagePreviews: string[]; // Blob preview ảnh mới
  options: EditColorOptionItem[];
};

// Loại phân loại-2 → key canonical (khớp translateKey + hasAnyParams + parseVariantAttributes)
const ATTR2_PRESETS = [
  { label: 'Kích thước', key: 'size' },
  { label: 'RAM', key: 'ram' },
  { label: 'Dung lượng', key: 'storage' },
  { label: 'Vi xử lý', key: 'cpu' },
] as const;

// Tách "Đỏ, L" → ["Đỏ", "L"] cho data legacy thiếu attributes chuẩn
function splitVariantName(name: string): [string, string] {
  const parts = (name || '')
    .split(/\s*[-,\/|]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [parts[0] ?? '', parts.slice(1).join(' ')];
}

// Kiểu dữ liệu chứa thông tin các lỗi khi validate Form
type FormErrors = {
  name?: string;
  price?: string;
  weight?: string;
  category_id?: string;
  stock_quantity?: string;
  variants?: string;
  [key: string]: string | undefined;
};

// Hàm khởi tạo một dòng phân loại trống
function createEmptyEditOption(): EditColorOptionItem {
  return { value: '', sku: '', additional_price: 0, stock_quantity: 0 };
}

// Hàm khởi tạo một nhóm màu trống (kèm 1 phân loại)
function createEmptyEditColorGroup(): EditColorGroupItem {
  return {
    color: '',
    hex: '',
    existingImages: [],
    newImages: [],
    newImagePreviews: [],
    options: [createEmptyEditOption()],
  };
}

/**
 * Component hiển thị khu vực upload hình ảnh cho từng biến thể.
 * Hỗ trợ hiển thị ảnh cũ đã tải lên, xem trước ảnh mới chọn, xóa ảnh cũ/mới và kéo thả tối đa 3 ảnh.
 */
function EditVariantImageDropzone({
  variantIndex,
  existingImages,
  newImages,
  newImagePreviews,
  onRemoveExisting,
  onAddNewImages,
  onRemoveNewImage,
}: {
  variantIndex: number;
  existingImages: string[];
  newImages: File[];
  newImagePreviews: string[];
  onRemoveExisting: (variantIndex: number, imageUrl: string) => void;
  onAddNewImages: (variantIndex: number, files: File[]) => void;
  onRemoveNewImage: (variantIndex: number, imageIndex: number) => void;
}) {
  const totalImages = existingImages.length + newImages.length; // Tổng số ảnh hiện tại của biến thể
  const remainingSlots = 3 - totalImages; // Số lượng ảnh còn lại có thể upload (tối đa 3)

  // Cấu hình Dropzone kéo thả ảnh cho biến thể
  const { getRootProps, getInputProps } = useDropzone({
    accept: { 'image/*': [] }, // Chỉ nhận các file ảnh
    multiple: true, // Cho phép chọn nhiều ảnh cùng lúc
    disabled: remainingSlots <= 0, // Vô hiệu hóa kéo thả nếu đã đủ 3 ảnh
    maxSize: 10 * 1024 * 1024,
    onDrop: (acceptedFiles) => {
      // Giới hạn số file nhận vào vừa đúng số slot còn lại
      const filesToAdd = acceptedFiles.slice(0, remainingSlots);
      onAddNewImages(variantIndex, filesToAdd);
    },
    onDropRejected: (fileRejections) => {
      fileRejections.forEach((rejection) => {
        const { file, errors } = rejection;
        errors.forEach((err) => {
          if (err.code === 'file-too-large') {
            toast.error(
              `Ảnh biến thể "${file.name}" vượt quá 10MB. Vui lòng chọn ảnh nhỏ hơn.`,
            );
          } else if (err.code === 'file-invalid-type') {
            toast.error(
              `File "${file.name}" không đúng định dạng. Chỉ chấp nhận các file ảnh.`,
            );
          } else {
            toast.error(`Lỗi tải file: ${err.message}`);
          }
        });
      });
    },
  });

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground">
        Ảnh của màu (tối đa 3)
      </p>
      <div className="flex flex-wrap gap-2">
        {/* Vòng lặp hiển thị những ảnh Cũ đang được giữ lại */}
        {existingImages.map((imageUrl, imgIdx) => (
          <div
            key={`existing-${imgIdx}`}
            className="relative h-16 w-16 rounded-lg border overflow-hidden group bg-zinc-100 dark:bg-zinc-900"
          >
            <img
              src={imageUrl}
              alt={`Ảnh cũ ${imgIdx + 1}`}
              className="w-full h-full object-cover"
            />
            {/* Nút xóa ảnh cũ ra khỏi danh sách gửi lên (chỉ xóa ở giao diện trước, không xóa trực tiếp trên DB lúc này) */}
            <button
              type="button"
              onClick={() => onRemoveExisting(variantIndex, imageUrl)}
              className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-rose-600/90 text-white opacity-0 group-hover:opacity-100 transition"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {/* Vòng lặp hiển thị các ảnh Mới được người dùng chọn thêm */}
        {newImagePreviews.map((previewUrl, imgIdx) => (
          <div
            key={`new-${imgIdx}`}
            className="relative h-16 w-16 rounded-lg border overflow-hidden group bg-violet-50 dark:bg-violet-950/20"
          >
            <img
              src={previewUrl}
              alt={`Ảnh mới ${imgIdx + 1}`}
              className="w-full h-full object-cover opacity-80"
            />
            {/* Nhãn đánh dấu ảnh mới */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[9px] bg-violet-600 text-white font-bold px-1 py-0.5 rounded">
                Mới
              </span>
            </div>
            {/* Nút xóa bỏ ảnh mới đã chọn */}
            <button
              type="button"
              onClick={() => onRemoveNewImage(variantIndex, imgIdx)}
              className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-zinc-800/90 text-white opacity-0 group-hover:opacity-100 transition"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {/* Khung bấm chọn file / kéo thả ảnh mới nếu còn lượt */}
        {remainingSlots > 0 && (
          <div
            {...getRootProps()}
            className="h-16 w-16 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex flex-col items-center justify-center cursor-pointer hover:border-violet-500 hover:bg-violet-50/20 dark:hover:bg-violet-950/10 transition"
          >
            <input {...getInputProps()} />
            <Plus className="h-5 w-5 text-zinc-400" />
            <span className="text-[9px] text-muted-foreground font-semibold mt-0.5">
              {remainingSlots}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string; // Lấy ID sản phẩm cần chỉnh sửa từ URL

  // --- CÁC TRẠNG THÁI LOADING & LỖI ---
  const [isLoadingProduct, setIsLoadingProduct] = useState(true); // Load thông tin sản phẩm ban đầu
  const [isSubmitting, setIsSubmitting] = useState(false); // Đang submit form
  const [errors, setErrors] = useState<FormErrors>({}); // Chứa thông tin lỗi validate form
  const [isSuspended, setIsSuspended] = useState(false);
  const [moderationReason, setModerationReason] = useState<string | null>(null);

  // --- CÁC TRẠNG THÁI LIÊN QUAN ĐẾN DANH MỤC ---
  const [categories, setCategories] = useState<CategoryResponseType[]>([]); // Toàn bộ danh mục hệ thống
  const [selectedParentId, setSelectedParentId] = useState<string>(''); // ID danh mục cha được chọn

  // --- CÁC TRẠNG THÁI THÔNG TIN CƠ BẢN SẢN PHẨM ---
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<string>('');
  const [sku, setSku] = useState('');
  const [weight, setWeight] = useState<string>('');
  const [length, setLength] = useState<string>('');
  const [width, setWidth] = useState<string>('');
  const [height, setHeight] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>(''); // ID danh mục con (lưu trữ chính thức vào sản phẩm)
  const [stockQuantity, setStockQuantity] = useState<string>(''); // Số lượng tồn kho nếu không có biến thể
  const [hasVariants, setHasVariants] = useState(false); // Đánh dấu sản phẩm có phân loại biến thể hay không

  // --- CÁC TRẠNG THÁI ẢNH ĐẠI DIỆN (THUMBNAIL) ---
  const [existingThumbnailUrl, setExistingThumbnailUrl] = useState<
    string | null
  >(null); // URL ảnh đại diện hiện tại
  const [newThumbnailFile, setNewThumbnailFile] = useState<File | null>(null); // File ảnh đại diện mới chọn
  const [newThumbnailPreview, setNewThumbnailPreview] = useState<string | null>(
    null,
  ); // Preview ảnh đại diện mới

  // --- CÁC TRẠNG THÁI BỘ SƯU TẬP ẢNH (GALLERY) ---
  const [existingGalleryImages, setExistingGalleryImages] = useState<string[]>(
    [],
  ); // Các ảnh gallery cũ được giữ lại
  const [newGalleryFiles, setNewGalleryFiles] = useState<File[]>([]); // File ảnh gallery mới chọn
  const [newGalleryPreviews, setNewGalleryPreviews] = useState<string[]>([]); // Preview ảnh gallery mới

  // --- DANH SÁCH BIẾN THỂ (nhóm theo màu, ragged) ---
  const [colorGroups, setColorGroups] = useState<EditColorGroupItem[]>([]);
  const [attr2Key, setAttr2Key] = useState<string>('size'); // key phân-loại-2 canonical

  // DỌN DẸP BỘ NHỚ: Thu hồi (revoke) các đường dẫn xem trước ảnh tạm thời (Blob URLs) khi component unmount
  useEffect(() => {
    return () => {
      if (newThumbnailPreview) URL.revokeObjectURL(newThumbnailPreview);
      newGalleryPreviews.forEach((url) => URL.revokeObjectURL(url));
      colorGroups.forEach((g) =>
        g.newImagePreviews.forEach((url) => URL.revokeObjectURL(url)),
      );
    };
  }, []);

  // Phát sự kiện cập nhật tên sản phẩm lên breadcrumb của Layout
  useEffect(() => {
    if (name) {
      window.dispatchEvent(
        new CustomEvent('update-breadcrumb', {
          detail: { key: productId, label: name },
        }),
      );
    }
  }, [name, productId]);

  // LẤY DỮ LIỆU BAN ĐẦU: Gọi đồng thời API lấy danh mục và API chi tiết sản phẩm cần sửa
  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingProduct(true);
      try {
        const [categoriesRes, productRes] = await Promise.all([
          categoriesApiRequest.getAll(),
          sellerProductsApiRequest.getProductDetail(productId),
        ]);

        const allCategories = categoriesRes.data ?? [];
        setCategories(allCategories);

        const product = productRes.data;
        if (product) {
          setIsSuspended(product.status === 'suspended');
          setModerationReason(product.moderation_reason ?? null);
        }
        prefillForm(product, allCategories); // Đổ dữ liệu cũ vào form nhập liệu
      } catch (error: any) {
        const msg = getErrorMessage(error);
        toast.error(msg);
        router.push('/seller/products'); // Gặp lỗi thì đẩy người dùng về trang danh sách
      } finally {
        setIsLoadingProduct(false);
      }
    };
    fetchData();
  }, [productId]);

  // ĐỔ DỮ LIỆU (PRE-FILL): Gán các dữ liệu cũ từ server vào các biến State của form
  const prefillForm = (
    product: ProductResponseType,
    allCategories: CategoryResponseType[],
  ) => {
    setName(product.name);
    setDescription(
      typeof product.description === 'string' ? product.description : '',
    );
    setPrice(String(product.price));
    setSku(typeof product.sku === 'string' ? product.sku : '');
    setWeight(String(product.weight));
    setLength(product.length != null ? String(product.length) : '');
    setWidth(product.width != null ? String(product.width) : '');
    setHeight(product.height != null ? String(product.height) : '');
    setHasVariants(product.has_variants);
    setStockQuantity(
      product.has_variants ? '' : String(product.stock_quantity),
    );

    // Gán URL thumbnail cũ
    if (product.thumbnail_url && typeof product.thumbnail_url === 'string') {
      setExistingThumbnailUrl(product.thumbnail_url);
    }

    // Sử dụng trực tiếp trường gallery lưu ở database để tránh bị lẫn các ảnh của biến thể
    const galleryUrls = Array.isArray(product.gallery) ? product.gallery : [];
    setExistingGalleryImages(galleryUrls);

    // Gán dữ liệu danh mục cũ: tìm danh mục cha dựa trên danh mục con của sản phẩm
    if (product.category) {
      const currentCategory = allCategories.find(
        (c) => c.id === product.category?.id,
      );
      if (currentCategory?.parent) {
        setSelectedParentId(currentCategory.parent.id);
        setCategoryId(currentCategory.id);
      } else if (currentCategory) {
        // Nếu bản thân danh mục đó là danh mục cha (không có parent), chọn trực tiếp
        setSelectedParentId(currentCategory.id);
        setCategoryId(currentCategory.id);
      }
    }

    // Gán danh sách biến thể cũ — gom theo MÀU (model C-normalized).
    if (product.has_variants && product.variants.length > 0) {
      const colorGroups = (product.color_groups ?? {}) as Record<
        string,
        { hex: string | null; images: string[] }
      >;
      // Có color_groups (sp mới) → ảnh/hex lấy từ đó; legacy (null) → seed từ variant.images.
      const usingColorGroups = Object.keys(colorGroups).length > 0;

      let inferredKey = 'size';
      const groupsMap = new Map<string, EditColorGroupItem>();

      product.variants.forEach((v) => {
        const attrs = (v.attributes ?? {}) as Record<string, string>;
        const [fallbackColor, fallbackVal] = splitVariantName(v.name);
        const color = (attrs.color ?? fallbackColor ?? '').trim();

        // Key phân-loại-2 = key attributes khác 'color' (ram/size/storage/cpu…).
        const nonColorKey = Object.keys(attrs).find((k) => k !== 'color');
        if (nonColorKey) inferredKey = nonColorKey;
        const value = nonColorKey ? attrs[nonColorKey] : fallbackVal;

        if (!groupsMap.has(color)) {
          groupsMap.set(color, {
            color,
            hex: usingColorGroups ? (colorGroups[color]?.hex ?? '') : '',
            existingImages: usingColorGroups
              ? (colorGroups[color]?.images ?? [])
              : [],
            newImages: [],
            newImagePreviews: [],
            options: [],
          });
        }
        const group = groupsMap.get(color)!;

        // Legacy: gom ảnh per-variant thành ảnh của màu (dedupe, tối đa 3).
        if (!usingColorGroups) {
          (v.images ?? []).forEach((url) => {
            if (
              group.existingImages.length < 3 &&
              !group.existingImages.includes(url)
            ) {
              group.existingImages.push(url);
            }
          });
        }

        group.options.push({
          id: v.id, // giữ id biến thể cũ → không tạo trùng/mất variant, URL cache còn match
          value: value ?? '',
          sku: v.sku || '',
          additional_price: v.additional_price,
          stock_quantity: v.stock_quantity,
        });
      });

      // Nếu key suy ra ngoài preset → không mất giá trị, vẫn set để hiển thị đúng.
      setAttr2Key(inferredKey);
      setColorGroups(Array.from(groupsMap.values()));
    }
  };

  // Chia danh sách các danh mục phục vụ chọn dropdown
  // Danh mục gốc (parent = null) và phải có ít nhất 1 danh mục con
  const rootCategories = categories.filter(
    (c) => !c.parent && categories.some((child) => child.parent?.id === c.id),
  );
  const childCategories = selectedParentId
    ? categories.filter((c) => c.parent?.id === selectedParentId) // Danh mục con tương ứng với danh mục cha đã chọn
    : [];

  // Khi danh mục cha thay đổi thì reset danh mục con đã chọn
  const handleParentChange = (parentId: string) => {
    setSelectedParentId(parentId);
    setCategoryId('');
    if (errors.category_id) {
      setErrors((prev) => ({ ...prev, category_id: undefined }));
    }
  };

  // Wrapper handlers to clear errors when users modify basic fields
  const handleNameChange = (val: string) => {
    setName(val);
    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
  };

  const handlePriceChange = (val: string) => {
    setPrice(val);
    if (errors.price) setErrors((prev) => ({ ...prev, price: undefined }));
  };

  const handleWeightChange = (val: string) => {
    setWeight(val);
    if (errors.weight) setErrors((prev) => ({ ...prev, weight: undefined }));
  };

  const handleCategoryIdChange = (val: string) => {
    setCategoryId(val);
    if (errors.category_id)
      setErrors((prev) => ({ ...prev, category_id: undefined }));
  };

  const handleStockQuantityChange = (val: string) => {
    setStockQuantity(val);
    if (errors.stock_quantity)
      setErrors((prev) => ({ ...prev, stock_quantity: undefined }));
  };

  // Cấu hình Dropzone ảnh đại diện (Thumbnail)
  const { getRootProps: getThumbProps, getInputProps: getThumbInputProps } =
    useDropzone({
      accept: { 'image/*': [] },
      multiple: false, // Chỉ cho chọn 1 ảnh đại diện duy nhất
      maxSize: 10 * 1024 * 1024,
      onDrop: (acceptedFiles) => {
        const file = acceptedFiles[0];
        if (!file) return;
        // Nếu có preview cũ trước đó, hãy giải phóng bộ nhớ
        if (newThumbnailPreview) URL.revokeObjectURL(newThumbnailPreview);
        setNewThumbnailFile(file);
        setNewThumbnailPreview(URL.createObjectURL(file)); // Tạo link xem trước ảnh mới chọn
      },
      onDropRejected: (fileRejections) => {
        fileRejections.forEach((rejection) => {
          const { file, errors } = rejection;
          errors.forEach((err) => {
            if (err.code === 'file-too-large') {
              toast.error(
                `Ảnh đại diện "${file.name}" vượt quá 10MB. Vui lòng chọn ảnh nhỏ hơn.`,
              );
            } else if (err.code === 'file-invalid-type') {
              toast.error(
                `File "${file.name}" không đúng định dạng. Chỉ chấp nhận các file ảnh.`,
              );
            } else {
              toast.error(`Lỗi tải file: ${err.message}`);
            }
          });
        });
      },
    });

  // Cấu hình Dropzone bộ sưu tập ảnh (Gallery)
  const totalGalleryCount =
    existingGalleryImages.length + newGalleryFiles.length; // Tổng số ảnh cũ giữ lại + ảnh mới chọn thêm
  const remainingGallerySlots = 5 - totalGalleryCount; // Chỉ cho phép tối đa 5 ảnh phụ

  const { getRootProps: getGalleryProps, getInputProps: getGalleryInputProps } =
    useDropzone({
      accept: { 'image/*': [] },
      multiple: true,
      disabled: remainingGallerySlots <= 0, // Đầy slot thì khóa tính năng
      maxSize: 10 * 1024 * 1024,
      onDrop: (acceptedFiles) => {
        const filesToAdd = acceptedFiles.slice(0, remainingGallerySlots);
        const newPreviews = filesToAdd.map((f) => URL.createObjectURL(f));
        setNewGalleryFiles((prev) => [...prev, ...filesToAdd]);
        setNewGalleryPreviews((prev) => [...prev, ...newPreviews]);
      },
      onDropRejected: (fileRejections) => {
        fileRejections.forEach((rejection) => {
          const { file, errors } = rejection;
          errors.forEach((err) => {
            if (err.code === 'file-too-large') {
              toast.error(
                `Ảnh bộ sưu tập "${file.name}" vượt quá 10MB. Vui lòng chọn ảnh nhỏ hơn.`,
              );
            } else if (err.code === 'file-invalid-type') {
              toast.error(
                `File "${file.name}" không đúng định dạng. Chỉ chấp nhận các file ảnh.`,
              );
            } else {
              toast.error(`Lỗi tải file: ${err.message}`);
            }
          });
        });
      },
    });

  // Loại bỏ một ảnh cũ trong gallery (chỉ bỏ khỏi mảng hiển thị và gửi lên, API backend sẽ xóa khi nhận submit)
  const handleRemoveExistingGallery = (imageUrl: string) => {
    setExistingGalleryImages((prev) => prev.filter((url) => url !== imageUrl));
  };

  // Loại bỏ một ảnh mới đã chọn trong gallery trước khi upload
  const handleRemoveNewGallery = (index: number) => {
    URL.revokeObjectURL(newGalleryPreviews[index]);
    setNewGalleryFiles((prev) => prev.filter((_, i) => i !== index));
    setNewGalleryPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // --- CÁC HÀM TƯƠNG TÁC NHÓM MÀU ---

  const handleAddColorGroup = () => {
    setColorGroups((prev) => [...prev, createEmptyEditColorGroup()]);
    if (errors.variants) {
      setErrors((prev) => ({ ...prev, variants: undefined }));
    }
  };

  const handleRemoveColorGroup = (colorIndex: number) => {
    const group = colorGroups[colorIndex];
    group.newImagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setColorGroups((prev) => prev.filter((_, i) => i !== colorIndex));
    setErrors((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k.startsWith(`color_${colorIndex}_`)) delete next[k];
      });
      return next;
    });
  };

  const handleColorNameChange = (colorIndex: number, value: string) => {
    setColorGroups((prev) =>
      prev.map((g, i) => (i === colorIndex ? { ...g, color: value } : g)),
    );
    const errKey = `color_${colorIndex}_name`;
    if (errors[errKey]) setErrors((prev) => ({ ...prev, [errKey]: undefined }));
    if (errors.variants) {
      setErrors((prev) => ({ ...prev, variants: undefined }));
    }
  };

  // Đặt/bỏ mã màu hex ('' = bỏ chọn → chấm màu fallback COLOR_MAP khi hiển thị).
  const handleColorHexChange = (colorIndex: number, value: string) => {
    setColorGroups((prev) =>
      prev.map((g, i) => (i === colorIndex ? { ...g, hex: value } : g)),
    );
  };

  // Xóa 1 ảnh màu cũ (chỉ bỏ khỏi danh sách gửi lên; BE xóa asset khi nhận submit)
  const handleRemoveExistingColorImage = (
    colorIndex: number,
    imageUrl: string,
  ) => {
    setColorGroups((prev) =>
      prev.map((g, i) =>
        i === colorIndex
          ? {
              ...g,
              existingImages: g.existingImages.filter(
                (url) => url !== imageUrl,
              ),
            }
          : g,
      ),
    );
  };

  const handleAddNewColorImages = (colorIndex: number, files: File[]) => {
    const newPreviews = files.map((f) => URL.createObjectURL(f));
    setColorGroups((prev) =>
      prev.map((g, i) =>
        i === colorIndex
          ? {
              ...g,
              newImages: [...g.newImages, ...files],
              newImagePreviews: [...g.newImagePreviews, ...newPreviews],
            }
          : g,
      ),
    );
  };

  const handleRemoveNewColorImage = (
    colorIndex: number,
    imageIndex: number,
  ) => {
    setColorGroups((prev) =>
      prev.map((g, i) => {
        if (i !== colorIndex) return g;
        URL.revokeObjectURL(g.newImagePreviews[imageIndex]);
        return {
          ...g,
          newImages: g.newImages.filter((_, idx) => idx !== imageIndex),
          newImagePreviews: g.newImagePreviews.filter(
            (_, idx) => idx !== imageIndex,
          ),
        };
      }),
    );
  };

  // --- CÁC HÀM TƯƠNG TÁC PHÂN LOẠI (option) ---

  const handleAddOption = (colorIndex: number) => {
    setColorGroups((prev) =>
      prev.map((g, i) =>
        i === colorIndex
          ? { ...g, options: [...g.options, createEmptyEditOption()] }
          : g,
      ),
    );
    const errKey = `color_${colorIndex}_opts`;
    if (errors[errKey]) setErrors((prev) => ({ ...prev, [errKey]: undefined }));
  };

  const handleRemoveOption = (colorIndex: number, optionIndex: number) => {
    setColorGroups((prev) =>
      prev.map((g, i) =>
        i === colorIndex
          ? { ...g, options: g.options.filter((_, oi) => oi !== optionIndex) }
          : g,
      ),
    );
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`color_${colorIndex}_opt_${optionIndex}_val`];
      delete next[`color_${colorIndex}_opt_${optionIndex}_stock`];
      return next;
    });
  };

  const handleOptionChange = (
    colorIndex: number,
    optionIndex: number,
    field: keyof Omit<EditColorOptionItem, 'id'>,
    value: string | number,
  ) => {
    setColorGroups((prev) =>
      prev.map((g, i) =>
        i === colorIndex
          ? {
              ...g,
              options: g.options.map((o, oi) =>
                oi === optionIndex ? { ...o, [field]: value } : o,
              ),
            }
          : g,
      ),
    );
    const errKeyVal = `color_${colorIndex}_opt_${optionIndex}_val`;
    const errKeyStock = `color_${colorIndex}_opt_${optionIndex}_stock`;
    if (field === 'value' && errors[errKeyVal]) {
      setErrors((prev) => ({ ...prev, [errKeyVal]: undefined }));
    }
    if (field === 'stock_quantity' && errors[errKeyStock]) {
      setErrors((prev) => ({ ...prev, [errKeyStock]: undefined }));
    }
  };

  // --- HÀM VALIDATE FORM TRƯỚC KHI SUBMIT ---
  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!name.trim()) newErrors.name = 'Tên sản phẩm không được để trống.';
    if (!price || parseFloat(price) < 0)
      newErrors.price = 'Giá sản phẩm không hợp lệ.';
    if (!weight || parseFloat(weight) < 1)
      newErrors.weight = 'Trọng lượng phải ít nhất 1 gram.';
    if (!categoryId) newErrors.category_id = 'Vui lòng chọn danh mục.';

    if (!hasVariants) {
      // Nếu KHÔNG có biến thể, thì kiểm tra số lượng tồn kho sản phẩm gốc
      if (!stockQuantity || parseInt(stockQuantity) < 0) {
        newErrors.stock_quantity = 'Tồn kho không hợp lệ.';
      }
    } else {
      // Nếu CÓ biến thể, kiểm tra từng màu + phân loại (KHÔNG ép ảnh — ảnh optional)
      if (colorGroups.length === 0) {
        newErrors.variants = 'Cần ít nhất 1 màu.';
      } else {
        for (let ci = 0; ci < colorGroups.length; ci++) {
          const g = colorGroups[ci];
          if (!g.color.trim()) {
            newErrors[`color_${ci}_name`] = 'Tên màu không được để trống.';
          }
          if (g.options.length === 0) {
            newErrors[`color_${ci}_opts`] = 'Mỗi màu cần ít nhất 1 phân loại.';
          }
          for (let oi = 0; oi < g.options.length; oi++) {
            const o = g.options[oi];
            if (!o.value.trim()) {
              newErrors[`color_${ci}_opt_${oi}_val`] =
                'Giá trị phân loại trống.';
            }
            if (o.stock_quantity < 0) {
              newErrors[`color_${ci}_opt_${oi}_stock`] =
                'Tồn kho không được âm.';
            }
          }
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0; // Trả về true nếu không có bất kỳ lỗi nào
  };

  // --- HÀM GỬI DỮ LIỆU CẬP NHẬT (SUBMIT FORM) ---
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // Ngăn trình duyệt load lại trang mặc định
    if (!validate()) {
      toast.error('Vui lòng kiểm tra lại các trường bắt buộc.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Dùng FormData để hỗ trợ upload nhiều file đính kèm song song với thông tin JSON khác
      const formData = new FormData();

      // Đưa các thông tin cơ bản vào FormData
      formData.append('name', name.trim());
      formData.append('description', description.trim());
      formData.append('price', price);
      if (sku.trim()) formData.append('sku', sku.trim());
      formData.append('weight', weight);
      if (length) formData.append('length', length);
      if (width) formData.append('width', width);
      if (height) formData.append('height', height);
      formData.append('category_id', categoryId);
      formData.append('has_variants', String(hasVariants));

      // Lưu trữ tồn kho của sản phẩm không có biến thể
      if (!hasVariants && stockQuantity) {
        formData.append('stock_quantity', stockQuantity);
      }

      // Đính kèm ảnh Thumbnail mới nếu người dùng vừa đổi ảnh đại diện
      if (newThumbnailFile) {
        formData.append('thumbnail', newThumbnailFile);
      }

      // Gửi danh sách các URL ảnh cũ của bộ sưu tập còn được giữ lại dưới dạng chuỗi JSON
      formData.append(
        'existingGalleryImages',
        JSON.stringify(existingGalleryImages),
      );
      // Đính kèm từng file ảnh phụ mới tải lên dưới cùng 1 tên key để Backend nhận diện dạng mảng
      newGalleryFiles.forEach((file) => {
        formData.append('general_gallery', file);
      });

      // Xử lý đính kèm biến thể (flatten màu × phân loại) + nhóm ảnh theo màu (model C-normalized)
      if (hasVariants) {
        // Flatten lá: mỗi (màu × option) → 1 variant. Giữ id biến thể cũ → BE UPDATE đúng,
        // không tạo trùng/mất variant (URL/localStorage cache còn match). Option mới (không id) → tạo mới.
        const variantsData = colorGroups.flatMap((g) =>
          g.options.map((o) => ({
            ...(o.id ? { id: o.id } : {}),
            name: `${g.color}, ${o.value}`,
            sku: o.sku || undefined,
            additional_price: o.additional_price,
            stock_quantity: o.stock_quantity,
            attributes: { color: g.color, [attr2Key]: o.value },
          })),
        );
        formData.append('variants', JSON.stringify(variantsData));

        // Nhóm ảnh theo màu: hex + existingImages giữ lại + imageCount ảnh mới; flatten file mới đúng thứ tự
        const colorImagesMeta = colorGroups.map((g) => ({
          color: g.color,
          hex: g.hex || undefined,
          existingImages: g.existingImages,
          imageCount: g.newImages.length,
        }));
        formData.append('colorImages', JSON.stringify(colorImagesMeta));
        colorGroups.forEach((g) => {
          g.newImages.forEach((file) => formData.append('color_images', file));
        });
      }

      // Gọi API gửi yêu cầu cập nhật sản phẩm
      await sellerProductsApiRequest.updateProduct(productId, formData);
      toast.success('Cập nhật sản phẩm thành công!');
      router.push('/seller/products'); // Chuyển về trang danh sách quản lý
    } catch (error: any) {
      const msg = getErrorMessage(error);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- GIAO DIỆN SKELETON KHI ĐANG LOAD THÔNG TIN SẢN PHẨM ---
  if (isLoadingProduct) {
    return (
      <div className="space-y-6 max-w-4xl animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-muted rounded-lg animate-pulse" />
          <div className="space-y-2">
            <div className="h-8 w-56 bg-muted rounded-lg animate-pulse" />
            <div className="h-4 w-72 bg-muted rounded animate-pulse" />
          </div>
        </div>
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="rounded-xl border bg-card p-6 shadow-sm space-y-4"
          >
            <div className="h-5 w-40 bg-muted rounded animate-pulse" />
            <div className="h-9 w-full bg-muted rounded-lg animate-pulse" />
            <div className="h-9 w-full bg-muted rounded-lg animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  // Thứ tự ưu tiên ảnh đại diện hiển thị trên form: ảnh mới chọn xem trước > ảnh cũ từ backend
  const displayThumbnail = newThumbnailPreview || existingThumbnailUrl;

  return (
    <div className="space-y-6 w-full animate-fade-in pb-10">
      {/* Header điều hướng quay lại */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="group inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          Quay lại danh sách sản phẩm
        </button>
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
            Chỉnh sửa sản phẩm
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Cập nhật thông tin, hình ảnh và biến thể sản phẩm.
          </p>
        </div>
      </div>

      {isSuspended && <ProductModerationBanner reason={moderationReason} />}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Form: Thông tin cơ bản */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-lg leading-none border-b pb-3">
            Thông tin cơ bản
          </h3>
          <Field>
            <FieldLabel htmlFor="edit-name">Tên sản phẩm *</FieldLabel>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              aria-invalid={!!errors.name}
            />
            {errors.name && <FieldError>{errors.name}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-description">Mô tả sản phẩm</FieldLabel>
            <Textarea
              id="edit-description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="edit-price">Giá bán (VNĐ) *</FieldLabel>
              <Input
                id="edit-price"
                type="number"
                min={0}
                value={price}
                onChange={(e) => handlePriceChange(e.target.value)}
                aria-invalid={!!errors.price}
              />
              {errors.price && <FieldError>{errors.price}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-sku">Mã SKU</FieldLabel>
              <Input
                id="edit-sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
              />
            </Field>
          </div>
        </div>

        {/* Form: Chọn danh mục phân loại */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-lg leading-none border-b pb-3">
            Danh mục
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {/* Dropdown danh mục cha */}
            <Field>
              <FieldLabel>Danh mục cha</FieldLabel>
              <select
                value={selectedParentId}
                onChange={(e) => handleParentChange(e.target.value)}
                className="w-full h-9 px-2.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              >
                <option value="">-- Chọn danh mục cha --</option>
                {rootCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </Field>
            {/* Dropdown danh mục con */}
            <Field>
              <FieldLabel>Danh mục con *</FieldLabel>
              <select
                value={categoryId}
                onChange={(e) => handleCategoryIdChange(e.target.value)}
                disabled={!selectedParentId || childCategories.length === 0}
                className="w-full h-9 px-2.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-invalid={!!errors.category_id}
              >
                <option value="">-- Chọn danh mục con --</option>
                {childCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              {errors.category_id && (
                <FieldError>{errors.category_id}</FieldError>
              )}
            </Field>
          </div>
        </div>

        {/* Form: Thông số đóng gói (Kích thước & Cân nặng cho đơn vị vận chuyển) */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-lg leading-none border-b pb-3">
            Thông số đóng gói
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field>
              <FieldLabel htmlFor="edit-weight">Trọng lượng (g) *</FieldLabel>
              <Input
                id="edit-weight"
                type="number"
                min={1}
                value={weight}
                onChange={(e) => handleWeightChange(e.target.value)}
                aria-invalid={!!errors.weight}
              />
              {errors.weight && <FieldError>{errors.weight}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-length">Dài (cm)</FieldLabel>
              <Input
                id="edit-length"
                type="number"
                min={0}
                value={length}
                onChange={(e) => setLength(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-width">Rộng (cm)</FieldLabel>
              <Input
                id="edit-width"
                type="number"
                min={0}
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-height">Cao (cm)</FieldLabel>
              <Input
                id="edit-height"
                type="number"
                min={0}
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
            </Field>
          </div>
        </div>

        {/* Form: Quản lý toàn bộ hình ảnh sản phẩm */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
          <h3 className="font-semibold text-lg leading-none border-b pb-3">
            Hình ảnh sản phẩm
          </h3>

          {/* Upload Thumbnail mới */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">Ảnh đại diện (Thumbnail)</p>
            <div
              {...getThumbProps()}
              className="relative h-36 w-36 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center cursor-pointer hover:border-violet-500 hover:bg-violet-50/20 dark:hover:bg-violet-950/10 transition overflow-hidden group"
            >
              <input {...getThumbInputProps()} />
              {displayThumbnail ? (
                <>
                  <img
                    src={displayThumbnail}
                    alt="Thumbnail"
                    className="w-full h-full object-cover"
                  />
                  {newThumbnailPreview && (
                    <div className="absolute top-1 left-1">
                      <span className="text-[9px] bg-violet-600 text-white font-bold px-1.5 py-0.5 rounded">
                        Mới
                      </span>
                    </div>
                  )}
                  {/* Nhãn phủ hover lên ảnh để báo thay đổi ảnh đại diện */}
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                    <span className="text-white text-xs font-bold">
                      Thay đổi
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <ImageIcon className="h-8 w-8 text-zinc-400" />
                  <span className="text-xs font-semibold text-center px-2">
                    Kéo thả hoặc click
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Upload ảnh Gallery bộ sưu tập */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">
              Ảnh bộ sưu tập (tối đa 5 ảnh)
            </p>
            <div className="flex flex-wrap gap-3">
              {/* Danh sách ảnh cũ đang giữ lại */}
              {existingGalleryImages.map((imageUrl, idx) => (
                <div
                  key={`existing-${idx}`}
                  className="relative h-24 w-24 rounded-lg border overflow-hidden group bg-zinc-100 dark:bg-zinc-900"
                >
                  <img
                    src={imageUrl}
                    alt={`Gallery cũ ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveExistingGallery(imageUrl)}
                    className="absolute top-1 right-1 p-0.5 rounded-full bg-rose-600/90 text-white opacity-0 group-hover:opacity-100 transition"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {/* Danh sách ảnh mới chọn */}
              {newGalleryPreviews.map((previewUrl, idx) => (
                <div
                  key={`new-${idx}`}
                  className="relative h-24 w-24 rounded-lg border overflow-hidden group bg-violet-50 dark:bg-violet-950/20"
                >
                  <img
                    src={previewUrl}
                    alt={`Gallery mới ${idx + 1}`}
                    className="w-full h-full object-cover opacity-80"
                  />
                  <div className="absolute top-1 left-1 pointer-events-none">
                    <span className="text-[9px] bg-violet-600 text-white font-bold px-1 py-0.5 rounded">
                      Mới
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveNewGallery(idx)}
                    className="absolute top-1 right-1 p-0.5 rounded-full bg-zinc-800/90 text-white opacity-0 group-hover:opacity-100 transition"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {/* Slot bấm tải thêm ảnh gallery phụ nếu chưa đủ 5 ảnh */}
              {remainingGallerySlots > 0 && (
                <div
                  {...getGalleryProps()}
                  className="h-24 w-24 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex flex-col items-center justify-center cursor-pointer hover:border-violet-500 hover:bg-violet-50/20 dark:hover:bg-violet-950/10 transition"
                >
                  <input {...getGalleryInputProps()} />
                  <Plus className="h-6 w-6 text-zinc-400" />
                  <span className="text-xs text-muted-foreground font-semibold mt-1">
                    Thêm ({remainingGallerySlots})
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Form: Quản lý Tồn kho & Các phân loại biến thể */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="font-semibold text-lg leading-none">
              Tồn kho & Biến thể
            </h3>
            {/* Toggle bật tắt sản phẩm nhiều biến thể */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">
                Sản phẩm có nhiều phiên bản
              </span>
              <div
                onClick={() => setHasVariants(!hasVariants)}
                className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors duration-200 ${hasVariants ? 'bg-violet-600' : 'bg-zinc-300 dark:bg-zinc-700'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${hasVariants ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </div>
            </div>
          </div>

          {/* Tồn kho trực tiếp (chỉ hiện khi sản phẩm KHÔNG chia biến thể) */}
          {!hasVariants && (
            <Field>
              <FieldLabel htmlFor="edit-stock">Số lượng tồn kho *</FieldLabel>
              <Input
                id="edit-stock"
                type="number"
                min={0}
                value={stockQuantity}
                onChange={(e) => handleStockQuantityChange(e.target.value)}
                aria-invalid={!!errors.stock_quantity}
                className="max-w-[200px]"
              />
              {errors.stock_quantity && (
                <FieldError>{errors.stock_quantity}</FieldError>
              )}
            </Field>
          )}

          {/* Nhóm ảnh theo màu × phân loại-2 (ragged) — chỉ hiện khi bật nhiều biến thể */}
          {hasVariants && (
            <div className="space-y-4">
              {errors.variants && <FieldError>{errors.variants}</FieldError>}

              {/* Loại phân loại-2 (áp cho toàn sản phẩm) — key canonical, KHÔNG gõ tự do */}
              <Field>
                <FieldLabel htmlFor="edit-attr2-key">Loại phân loại</FieldLabel>
                <select
                  id="edit-attr2-key"
                  value={attr2Key}
                  onChange={(e) => setAttr2Key(e.target.value)}
                  className="w-full max-w-[220px] h-9 px-2.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                >
                  {ATTR2_PRESETS.map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {preset.label}
                    </option>
                  ))}
                  {/* Key legacy ngoài preset → thêm tạm để không mất giá trị */}
                  {!ATTR2_PRESETS.some((p) => p.key === attr2Key) && (
                    <option value={attr2Key}>{attr2Key}</option>
                  )}
                </select>
              </Field>

              {colorGroups.map((group, ci) => {
                const attr2Label =
                  ATTR2_PRESETS.find((p) => p.key === attr2Key)?.label ??
                  attr2Key;
                return (
                  <div
                    key={ci}
                    className="rounded-lg border bg-muted/20 p-4 space-y-3 relative"
                  >
                    {/* Nút xóa màu */}
                    {colorGroups.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveColorGroup(ci)}
                        className="absolute top-3 right-3 p-1 rounded-md hover:bg-rose-100 dark:hover:bg-rose-950 text-rose-500 transition"
                        title="Xóa màu này"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <p className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wide">
                      Màu #{ci + 1}
                    </p>

                    {/* Tên màu + mã màu (hex, tùy chọn) */}
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="max-w-[280px] flex-1 min-w-[180px]">
                        <label className="text-xs font-semibold text-muted-foreground block mb-1">
                          Tên màu *
                        </label>
                        <Input
                          placeholder="Ví dụ: Đỏ"
                          value={group.color}
                          onChange={(e) =>
                            handleColorNameChange(ci, e.target.value)
                          }
                          aria-invalid={!!errors[`color_${ci}_name`]}
                        />
                        {errors[`color_${ci}_name`] && (
                          <FieldError>{errors[`color_${ci}_name`]}</FieldError>
                        )}
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1">
                          Mã màu (tùy chọn)
                        </label>
                        <div className="flex items-center gap-2">
                          <label
                            className="relative h-9 w-9 rounded-lg border border-zinc-200 dark:border-zinc-800 cursor-pointer overflow-hidden shrink-0"
                            style={{
                              backgroundColor: group.hex || 'transparent',
                            }}
                            title="Chọn mã màu"
                          >
                            <input
                              type="color"
                              value={group.hex || '#000000'}
                              onChange={(e) =>
                                handleColorHexChange(ci, e.target.value)
                              }
                              className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                            {!group.hex && (
                              <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-muted-foreground">
                                ?
                              </span>
                            )}
                          </label>
                          {group.hex && (
                            <button
                              type="button"
                              onClick={() => handleColorHexChange(ci, '')}
                              className="text-[11px] font-semibold text-muted-foreground hover:text-rose-500 transition"
                              title="Bỏ mã màu"
                            >
                              bỏ chọn
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Ảnh của màu (cũ + mới, up 1 lần/màu, optional) */}
                    <EditVariantImageDropzone
                      variantIndex={ci}
                      existingImages={group.existingImages}
                      newImages={group.newImages}
                      newImagePreviews={group.newImagePreviews}
                      onRemoveExisting={handleRemoveExistingColorImage}
                      onAddNewImages={handleAddNewColorImages}
                      onRemoveNewImage={handleRemoveNewColorImage}
                    />

                    {/* Danh sách phân loại-2 trong màu (ragged) */}
                    <div className="space-y-2 pt-1">
                      <p className="text-xs font-semibold text-muted-foreground">
                        Phân loại theo {attr2Label.toLowerCase()}
                      </p>
                      {errors[`color_${ci}_opts`] && (
                        <FieldError>{errors[`color_${ci}_opts`]}</FieldError>
                      )}
                      {group.options.map((option, oi) => (
                        <div
                          key={option.id || `new-${oi}`}
                          className="grid grid-cols-2 md:grid-cols-12 gap-2 items-start rounded-md bg-background/60 border p-2"
                        >
                          <div className="md:col-span-3">
                            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                              {attr2Label} *
                            </label>
                            <Input
                              placeholder="Ví dụ: L / 4gb"
                              value={option.value}
                              onChange={(e) =>
                                handleOptionChange(
                                  ci,
                                  oi,
                                  'value',
                                  e.target.value,
                                )
                              }
                              aria-invalid={
                                !!errors[`color_${ci}_opt_${oi}_val`]
                              }
                            />
                            {errors[`color_${ci}_opt_${oi}_val`] && (
                              <FieldError>
                                {errors[`color_${ci}_opt_${oi}_val`]}
                              </FieldError>
                            )}
                          </div>
                          <div className="md:col-span-3">
                            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                              SKU
                            </label>
                            <Input
                              placeholder="SKU-RED-L"
                              value={option.sku}
                              onChange={(e) =>
                                handleOptionChange(
                                  ci,
                                  oi,
                                  'sku',
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                          <div className="md:col-span-3">
                            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                              Giá thêm (VNĐ)
                            </label>
                            <Input
                              type="number"
                              min={0}
                              value={option.additional_price}
                              onChange={(e) =>
                                handleOptionChange(
                                  ci,
                                  oi,
                                  'additional_price',
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                              Tồn kho *
                            </label>
                            <Input
                              type="number"
                              min={0}
                              value={option.stock_quantity}
                              onChange={(e) =>
                                handleOptionChange(
                                  ci,
                                  oi,
                                  'stock_quantity',
                                  parseInt(e.target.value) || 0,
                                )
                              }
                              aria-invalid={
                                !!errors[`color_${ci}_opt_${oi}_stock`]
                              }
                            />
                            {errors[`color_${ci}_opt_${oi}_stock`] && (
                              <FieldError>
                                {errors[`color_${ci}_opt_${oi}_stock`]}
                              </FieldError>
                            )}
                          </div>
                          <div className="md:col-span-1 flex items-center gap-1 md:justify-center md:items-end md:h-full md:pb-1">
                            {option.id ? (
                              <span
                                className="text-[9px] bg-zinc-200 dark:bg-zinc-800 text-muted-foreground px-1 py-0.5 rounded font-mono"
                                title="Biến thể đã lưu"
                              >
                                cũ
                              </span>
                            ) : (
                              <span
                                className="text-[9px] bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 px-1 py-0.5 rounded font-bold"
                                title="Biến thể mới"
                              >
                                mới
                              </span>
                            )}
                            {group.options.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveOption(ci, oi)}
                                className="p-1 rounded-md hover:bg-rose-100 dark:hover:bg-rose-950 text-rose-500 transition"
                                title="Xóa phân loại này"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => handleAddOption(ci)}
                        className="flex items-center text-[11px] font-semibold px-3 py-1.5 border border-dashed border-violet-300 dark:border-violet-800 text-violet-600 dark:text-violet-400 rounded-md hover:bg-violet-50 dark:hover:bg-violet-950/20 transition"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Thêm phân loại
                      </button>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={handleAddColorGroup}
                className="flex items-center text-xs font-semibold px-4 py-2 border-2 border-dashed border-violet-400 text-violet-600 dark:text-violet-400 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950/20 transition w-2/5 mx-auto justify-center"
              >
                <Plus className="h-4 w-4 mr-1.5" /> Thêm màu
              </button>
            </div>
          )}

          {/* Các nút hành động nằm chung trong Card */}
          <div className="border-t pt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:text-foreground transition text-xs font-bold bg-background"
            >
              Hủy
            </button>
            <Button
              type="submit"
              disabled={isSubmitting || isSuspended}
              title={
                isSuspended
                  ? 'Sản phẩm đang bị gỡ — không thể chỉnh sửa'
                  : undefined
              }
              className="flex items-center gap-1.5 px-6 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-lg font-bold shadow-md shadow-violet-500/25 hover:shadow-violet-500/35 transition-all text-xs hover:scale-[1.01] active:scale-[0.99]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang lưu...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> Lưu thay đổi
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
