"use client"; // Chạy dưới dạng Client Component để xử lý logic tương tác trên trình duyệt

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useDropzone } from "react-dropzone"; // Thư viện kéo thả file
import { toast } from "sonner"; // Thông báo dạng pop-up
import {
  Plus,
  Trash2,
  Loader2,
  ImageIcon,
  ChevronLeft,
  Package,
  X,
  Save,
} from "lucide-react"; // Bộ biểu tượng SVG

import productsApiRequest from "@/apiRequests/products"; // API liên quan đến sản phẩm
import categoriesApiRequest from "@/apiRequests/categories"; // API liên quan đến danh mục
import { CategoryResponseType } from "@/schemaValidations/categories.schema";
import { ProductResponseType } from "@/schemaValidations/products.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";

// Định nghĩa kiểu dữ liệu cho một biến thể trong Form Chỉnh sửa
type EditVariantFormItem = {
  id?: string; // ID của biến thể (chỉ có với các biến thể cũ đã tồn tại trên cơ sở dữ liệu)
  name: string; // Tên biến thể (Ví dụ: "Đỏ - XL")
  sku: string; // Mã định danh hàng hóa (SKU) cho riêng biến thể
  additional_price: number; // Giá cộng thêm so với giá gốc sản phẩm
  stock_quantity: number; // Số lượng hàng tồn kho của biến thể này
  existingImages: string[]; // Danh sách các URL ảnh cũ của biến thể đang được giữ lại
  newImages: File[]; // Các file ảnh mới được thêm vào ở phiên làm việc này
  newImagePreviews: string[]; // URL dạng Blob để hiển thị trước ảnh mới tải lên
};

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

// Hàm khởi tạo một đối tượng biến thể trống rỗng
function createEmptyEditVariant(): EditVariantFormItem {
  return {
    name: "",
    sku: "",
    additional_price: 0,
    stock_quantity: 0,
    existingImages: [],
    newImages: [],
    newImagePreviews: [],
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
    accept: { "image/*": [] }, // Chỉ nhận các file ảnh
    multiple: true, // Cho phép chọn nhiều ảnh cùng lúc
    disabled: remainingSlots <= 0, // Vô hiệu hóa kéo thả nếu đã đủ 3 ảnh
    onDrop: (acceptedFiles) => {
      // Giới hạn số file nhận vào vừa đúng số slot còn lại
      const filesToAdd = acceptedFiles.slice(0, remainingSlots);
      onAddNewImages(variantIndex, filesToAdd);
    },
  });

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground">
        Ảnh biến thể (tối đa 3)
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

  // --- CÁC TRẠNG THÁI LIÊN QUAN ĐẾN DANH MỤC ---
  const [categories, setCategories] = useState<CategoryResponseType[]>([]); // Toàn bộ danh mục hệ thống
  const [selectedParentId, setSelectedParentId] = useState<string>(""); // ID danh mục cha được chọn

  // --- CÁC TRẠNG THÁI THÔNG TIN CƠ BẢN SẢN PHẨM ---
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<string>("");
  const [sku, setSku] = useState("");
  const [weight, setWeight] = useState<string>("");
  const [length, setLength] = useState<string>("");
  const [width, setWidth] = useState<string>("");
  const [height, setHeight] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>(""); // ID danh mục con (lưu trữ chính thức vào sản phẩm)
  const [stockQuantity, setStockQuantity] = useState<string>(""); // Số lượng tồn kho nếu không có biến thể
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

  // --- DANH SÁCH BIẾN THỂ ---
  const [variants, setVariants] = useState<EditVariantFormItem[]>([]);

  // DỌN DẸP BỘ NHỚ: Thu hồi (revoke) các đường dẫn xem trước ảnh tạm thời (Blob URLs) khi component unmount
  useEffect(() => {
    return () => {
      if (newThumbnailPreview) URL.revokeObjectURL(newThumbnailPreview);
      newGalleryPreviews.forEach((url) => URL.revokeObjectURL(url));
      variants.forEach((v) =>
        v.newImagePreviews.forEach((url) => URL.revokeObjectURL(url)),
      );
    };
  }, []);

  // Phát sự kiện cập nhật tên sản phẩm lên breadcrumb của Layout
  useEffect(() => {
    if (name) {
      window.dispatchEvent(
        new CustomEvent("update-breadcrumb", {
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
          productsApiRequest.getProductDetail(productId),
        ]);

        const allCategories = categoriesRes.data ?? [];
        setCategories(allCategories);

        const product = productRes.data;
        prefillForm(product, allCategories); // Đổ dữ liệu cũ vào form nhập liệu
      } catch (error: any) {
        const msg =
          error?.payload?.message ||
          error?.message ||
          "Không thể tải thông tin sản phẩm.";
        toast.error(Array.isArray(msg) ? msg.join(", ") : msg);
        router.push("/seller/products"); // Gặp lỗi thì đẩy người dùng về trang danh sách
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
      typeof product.description === "string" ? product.description : "",
    );
    setPrice(String(product.price));
    setSku(typeof product.sku === "string" ? product.sku : "");
    setWeight(String(product.weight));
    setLength(product.length != null ? String(product.length) : "");
    setWidth(product.width != null ? String(product.width) : "");
    setHeight(product.height != null ? String(product.height) : "");
    setHasVariants(product.has_variants);
    setStockQuantity(
      product.has_variants ? "" : String(product.stock_quantity),
    );

    // Gán URL thumbnail cũ
    if (product.thumbnail_url && typeof product.thumbnail_url === "string") {
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

    // Gán danh sách biến thể cũ
    if (product.has_variants && product.variants.length > 0) {
      const editVariants: EditVariantFormItem[] = product.variants.map((v) => ({
        id: v.id,
        name: v.name,
        sku: v.sku || "",
        additional_price: v.additional_price,
        stock_quantity: v.stock_quantity,
        existingImages: v.images, // Các ảnh cũ của biến thể
        newImages: [],
        newImagePreviews: [],
      }));
      setVariants(editVariants);
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
    setCategoryId("");
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
      accept: { "image/*": [] },
      multiple: false, // Chỉ cho chọn 1 ảnh đại diện duy nhất
      onDrop: (acceptedFiles) => {
        const file = acceptedFiles[0];
        if (!file) return;
        // Nếu có preview cũ trước đó, hãy giải phóng bộ nhớ
        if (newThumbnailPreview) URL.revokeObjectURL(newThumbnailPreview);
        setNewThumbnailFile(file);
        setNewThumbnailPreview(URL.createObjectURL(file)); // Tạo link xem trước ảnh mới chọn
      },
    });

  // Cấu hình Dropzone bộ sưu tập ảnh (Gallery)
  const totalGalleryCount =
    existingGalleryImages.length + newGalleryFiles.length; // Tổng số ảnh cũ giữ lại + ảnh mới chọn thêm
  const remainingGallerySlots = 5 - totalGalleryCount; // Chỉ cho phép tối đa 5 ảnh phụ

  const { getRootProps: getGalleryProps, getInputProps: getGalleryInputProps } =
    useDropzone({
      accept: { "image/*": [] },
      multiple: true,
      disabled: remainingGallerySlots <= 0, // Đầy slot thì khóa tính năng
      onDrop: (acceptedFiles) => {
        const filesToAdd = acceptedFiles.slice(0, remainingGallerySlots);
        const newPreviews = filesToAdd.map((f) => URL.createObjectURL(f));
        setNewGalleryFiles((prev) => [...prev, ...filesToAdd]);
        setNewGalleryPreviews((prev) => [...prev, ...newPreviews]);
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

  // --- CÁC HÀM TƯƠNG TÁC BIẾN THỂ ---

  // Thêm một hàng biến thể rỗng mới vào form
  const handleAddVariant = () => {
    setVariants((prev) => [...prev, createEmptyEditVariant()]);
    if (errors.variants) {
      setErrors((prev) => ({ ...prev, variants: undefined }));
    }
  };

  // Xóa một hàng biến thể ra khỏi danh sách
  const handleRemoveVariant = (index: number) => {
    const variant = variants[index];
    // Dọn dẹp link xem trước ảnh của biến thể đó để tránh rò rỉ bộ nhớ
    variant.newImagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setVariants((prev) => prev.filter((_, i) => i !== index));

    // Clear errors associated with the removed variant
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`variant_${index}_name`];
      delete next[`variant_${index}_stock`];
      delete next[`variant_${index}_images`];
      return next;
    });
  };

  // Xử lý thay đổi dữ liệu (tên, sku, tồn kho, giá...) tại một trường bất kỳ của biến thể
  const handleVariantChange = (
    index: number,
    field: keyof Omit<
      EditVariantFormItem,
      "id" | "existingImages" | "newImages" | "newImagePreviews"
    >,
    value: string | number,
  ) => {
    setVariants((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)),
    );

    // Clear dynamic error keys when modified
    const errKeyName = `variant_${index}_name`;
    const errKeyStock = `variant_${index}_stock`;
    if (field === "name" && errors[errKeyName]) {
      setErrors((prev) => ({ ...prev, [errKeyName]: undefined }));
    }
    if (field === "stock_quantity" && errors[errKeyStock]) {
      setErrors((prev) => ({ ...prev, [errKeyStock]: undefined }));
    }
    if (errors.variants) {
      setErrors((prev) => ({ ...prev, variants: undefined }));
    }
  };

  // Xóa ảnh cũ của một biến thể cụ thể
  const handleRemoveExistingVariantImage = (
    variantIndex: number,
    imageUrl: string,
  ) => {
    setVariants((prev) =>
      prev.map((v, i) =>
        i === variantIndex
          ? {
              ...v,
              existingImages: v.existingImages.filter(
                (url) => url !== imageUrl,
              ),
            }
          : v,
      ),
    );

    // Check if dynamic error is cleared
    // Note: User deleted an image, which might trigger errors again on submit, but we don't clear image count errors here as they are not inputting more yet.
  };

  // Thêm các ảnh mới cho một biến thể cụ thể
  const handleAddNewVariantImages = (variantIndex: number, files: File[]) => {
    const newPreviews = files.map((f) => URL.createObjectURL(f));
    setVariants((prev) =>
      prev.map((v, i) =>
        i === variantIndex
          ? {
              ...v,
              newImages: [...v.newImages, ...files],
              newImagePreviews: [...v.newImagePreviews, ...newPreviews],
            }
          : v,
      ),
    );
    const errKeyImages = `variant_${variantIndex}_images`;
    if (errors[errKeyImages]) {
      setErrors((prev) => ({ ...prev, [errKeyImages]: undefined }));
    }
  };

  // Xóa ảnh mới (chưa upload) của một biến thể cụ thể
  const handleRemoveNewVariantImage = (
    variantIndex: number,
    imageIndex: number,
  ) => {
    setVariants((prev) =>
      prev.map((v, i) => {
        if (i !== variantIndex) return v;
        URL.revokeObjectURL(v.newImagePreviews[imageIndex]);
        return {
          ...v,
          newImages: v.newImages.filter((_, idx) => idx !== imageIndex),
          newImagePreviews: v.newImagePreviews.filter(
            (_, idx) => idx !== imageIndex,
          ),
        };
      }),
    );
  };

  // --- HÀM VALIDATE FORM TRƯỚC KHI SUBMIT ---
  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!name.trim()) newErrors.name = "Tên sản phẩm không được để trống.";
    if (!price || parseFloat(price) < 0)
      newErrors.price = "Giá sản phẩm không hợp lệ.";
    if (!weight || parseFloat(weight) < 1)
      newErrors.weight = "Trọng lượng phải ít nhất 1 gram.";
    if (!categoryId) newErrors.category_id = "Vui lòng chọn danh mục.";

    if (!hasVariants) {
      // Nếu KHÔNG có biến thể, thì kiểm tra số lượng tồn kho sản phẩm gốc
      if (!stockQuantity || parseInt(stockQuantity) < 0) {
        newErrors.stock_quantity = "Tồn kho không hợp lệ.";
      }
    } else {
      // Nếu CÓ biến thể, kiểm tra từng dòng biến thể
      if (variants.length === 0) {
        newErrors.variants = "Cần ít nhất 1 biến thể.";
      } else {
        for (let i = 0; i < variants.length; i++) {
          const variant = variants[i];
          if (!variant.name.trim()) {
            newErrors[`variant_${i}_name`] =
              "Tên biến thể không được để trống.";
          }
          if (variant.stock_quantity < 0) {
            newErrors[`variant_${i}_stock`] = "Tồn kho không được âm.";
          }
          // Yêu cầu bắt buộc mỗi phân loại phải có ít nhất 1 ảnh (cũ hoặc mới)
          const totalVariantImages =
            variant.existingImages.length + variant.newImages.length;
          if (totalVariantImages === 0) {
            newErrors[`variant_${i}_images`] = "Biến thể cần ít nhất 1 ảnh.";
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
      toast.error("Vui lòng kiểm tra lại các trường bắt buộc.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Dùng FormData để hỗ trợ upload nhiều file đính kèm song song với thông tin JSON khác
      const formData = new FormData();

      // Đưa các thông tin cơ bản vào FormData
      formData.append("name", name.trim());
      formData.append("description", description.trim());
      formData.append("price", price);
      if (sku.trim()) formData.append("sku", sku.trim());
      formData.append("weight", weight);
      if (length) formData.append("length", length);
      if (width) formData.append("width", width);
      if (height) formData.append("height", height);
      formData.append("category_id", categoryId);
      formData.append("has_variants", String(hasVariants));

      // Lưu trữ tồn kho của sản phẩm không có biến thể
      if (!hasVariants && stockQuantity) {
        formData.append("stock_quantity", stockQuantity);
      }

      // Đính kèm ảnh Thumbnail mới nếu người dùng vừa đổi ảnh đại diện
      if (newThumbnailFile) {
        formData.append("thumbnail", newThumbnailFile);
      }

      // Gửi danh sách các URL ảnh cũ của bộ sưu tập còn được giữ lại dưới dạng chuỗi JSON
      formData.append(
        "existingGalleryImages",
        JSON.stringify(existingGalleryImages),
      );
      // Đính kèm từng file ảnh phụ mới tải lên dưới cùng 1 tên key để Backend nhận diện dạng mảng
      newGalleryFiles.forEach((file) => {
        formData.append("general_gallery", file);
      });

      // Xử lý đính kèm mảng biến thể
      if (hasVariants) {
        // Tạo cấu trúc dữ liệu JSON gửi lên cho biến thể.
        // Chỉ lưu thông tin metadata + "imageCount" tương ứng số ảnh mới để backend map đúng file tương ứng.
        const variantsData = variants.map((v) => ({
          ...(v.id ? { id: v.id } : {}), // Gửi kèm ID để backend biết đây là biến thể cũ cần sửa, không có ID sẽ là thêm mới
          name: v.name,
          sku: v.sku || undefined,
          additional_price: v.additional_price,
          stock_quantity: v.stock_quantity,
          existingImages: v.existingImages, // Ảnh cũ được giữ lại của biến thể này
          imageCount: v.newImages.length, // Số lượng file ảnh mới của biến thể này
        }));
        formData.append("variants", JSON.stringify(variantsData));

        // Duỗi phẳng (flatten) tất cả các file ảnh của mọi biến thể và đẩy lên cùng key 'variant_images'.
        // Backend dựa trên thứ tự xuất hiện và trường 'imageCount' bên trên để gán ảnh đúng vào biến thể.
        variants.forEach((v) => {
          v.newImages.forEach((imageFile) => {
            formData.append("variant_images", imageFile);
          });
        });
      }

      // Gọi API gửi yêu cầu cập nhật sản phẩm
      await productsApiRequest.updateProduct(productId, formData);
      toast.success("Cập nhật sản phẩm thành công!");
      router.push("/seller/products"); // Chuyển về trang danh sách quản lý
    } catch (error: any) {
      const msg =
        error?.payload?.message ||
        error?.message ||
        "Đã xảy ra lỗi khi cập nhật sản phẩm.";
      toast.error(Array.isArray(msg) ? msg.join(", ") : msg);
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
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
            Chỉnh sửa sản phẩm
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Cập nhật thông tin, hình ảnh và biến thể sản phẩm.
          </p>
        </div>
      </div>

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
                  <span className="text-[10px] text-muted-foreground font-semibold mt-1">
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
                className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors duration-200 ${hasVariants ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${hasVariants ? "translate-x-5" : "translate-x-0"}`}
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

          {/* Danh sách form biến thể chi tiết (chỉ hiện khi bật nhiều biến thể) */}
          {hasVariants && (
            <div className="space-y-4">
              {errors.variants && <FieldError>{errors.variants}</FieldError>}
              {variants.map((variant, idx) => (
                <div
                  key={variant.id || `new-${idx}`}
                  className="rounded-lg border bg-muted/20 p-4 space-y-3 relative"
                >
                  {/* Nút xóa dòng biến thể (chỉ cho phép xóa khi tổng số biến thể lớn hơn 1) */}
                  {variants.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveVariant(idx)}
                      className="absolute top-3 right-3 p-1 rounded-md hover:bg-rose-100 dark:hover:bg-rose-950 text-rose-500 transition"
                      title="Xóa biến thể này"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  {/* Tiêu đề biến thể và nhãn hiển thị loại biến thể mới hoặc đã lưu trên DB */}
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wide">
                      Biến thể #{idx + 1}
                    </p>
                    {variant.id && (
                      <span className="text-[10px] bg-zinc-200 dark:bg-zinc-800 text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                        Hiện có
                      </span>
                    )}
                    {!variant.id && (
                      <span className="text-[10px] bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded font-bold">
                        Mới
                      </span>
                    )}
                  </div>
                  {/* Grid nhập thông số của từng biến thể */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Tên biến thể *
                      </label>
                      <Input
                        placeholder="Ví dụ: Đỏ, Size L"
                        value={variant.name}
                        onChange={(e) =>
                          handleVariantChange(idx, "name", e.target.value)
                        }
                        aria-invalid={!!errors[`variant_${idx}_name`]}
                      />
                      {errors[`variant_${idx}_name`] && (
                        <FieldError>{errors[`variant_${idx}_name`]}</FieldError>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        SKU biến thể
                      </label>
                      <Input
                        placeholder="SKU-RED-L"
                        value={variant.sku}
                        onChange={(e) =>
                          handleVariantChange(idx, "sku", e.target.value)
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Giá thêm (VNĐ)
                      </label>
                      <Input
                        type="number"
                        min={0}
                        value={variant.additional_price}
                        onChange={(e) =>
                          handleVariantChange(
                            idx,
                            "additional_price",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Tồn kho *
                      </label>
                      <Input
                        type="number"
                        min={0}
                        value={variant.stock_quantity}
                        onChange={(e) =>
                          handleVariantChange(
                            idx,
                            "stock_quantity",
                            parseInt(e.target.value) || 0,
                          )
                        }
                        aria-invalid={!!errors[`variant_${idx}_stock`]}
                      />
                      {errors[`variant_${idx}_stock`] && (
                        <FieldError>
                          {errors[`variant_${idx}_stock`]}
                        </FieldError>
                      )}
                    </div>
                  </div>
                  {/* Dropzone quản lý ảnh dành riêng cho biến thể này */}
                  <EditVariantImageDropzone
                    variantIndex={idx}
                    existingImages={variant.existingImages}
                    newImages={variant.newImages}
                    newImagePreviews={variant.newImagePreviews}
                    onRemoveExisting={handleRemoveExistingVariantImage}
                    onAddNewImages={handleAddNewVariantImages}
                    onRemoveNewImage={handleRemoveNewVariantImage}
                  />
                  {errors[`variant_${idx}_images`] && (
                    <FieldError>{errors[`variant_${idx}_images`]}</FieldError>
                  )}
                </div>
              ))}
              {/* Nút bấm để nối tiếp thêm 1 biến thể trống mới */}
              <button
                type="button"
                onClick={handleAddVariant}
                className="flex items-center text-xs font-semibold px-4 py-2 border-2 border-dashed border-violet-400 text-violet-600 dark:text-violet-400 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950/20 transition w-2/5 mx-auto justify-center"
              >
                <Plus className="h-4 w-4 mr-1.5" /> Thêm biến thể mới
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
              disabled={isSubmitting}
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
