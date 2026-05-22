"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Loader2,
  ImageIcon,
  ChevronLeft,
  Package,
  X,
  Save,
} from "lucide-react";

import productsApiRequest from "@/apiRequests/products";
import categoriesApiRequest from "@/apiRequests/categories";
import { CategoryResponseType } from "@/schemaValidations/categories.schema";
import { ProductResponseType } from "@/schemaValidations/products.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";

// Kiểu dữ liệu cho 1 row biến thể trong form Edit
// Khác Create: có thêm id (biến thể cũ) và existingImages (URLs ảnh cũ giữ lại)
type EditVariantFormItem = {
  id?: string;
  name: string;
  sku: string;
  additional_price: number;
  stock_quantity: number;
  existingImages: string[];
  newImages: File[];
  newImagePreviews: string[];
};

type FormErrors = {
  name?: string;
  price?: string;
  weight?: string;
  category_id?: string;
  stock_quantity?: string;
  variants?: string;
  [key: string]: string | undefined;
};

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

// Component Dropzone ảnh biến thể cho Edit (hiển thị ảnh cũ + upload mới)
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
  const totalImages = existingImages.length + newImages.length;
  const remainingSlots = 3 - totalImages;

  const { getRootProps, getInputProps } = useDropzone({
    accept: { "image/*": [] },
    multiple: true,
    disabled: remainingSlots <= 0,
    onDrop: (acceptedFiles) => {
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
        {/* Ảnh cũ giữ lại */}
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
            <button
              type="button"
              onClick={() => onRemoveExisting(variantIndex, imageUrl)}
              className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-rose-600/90 text-white opacity-0 group-hover:opacity-100 transition"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {/* Ảnh mới preview */}
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
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[9px] bg-violet-600 text-white font-bold px-1 py-0.5 rounded">
                Mới
              </span>
            </div>
            <button
              type="button"
              onClick={() => onRemoveNewImage(variantIndex, imgIdx)}
              className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-zinc-800/90 text-white opacity-0 group-hover:opacity-100 transition"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {/* Slot upload thêm */}
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
  const productId = params.id as string;

  // State loading
  const [isLoadingProduct, setIsLoadingProduct] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // State danh mục
  const [categories, setCategories] = useState<CategoryResponseType[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<string>("");

  // State form cơ bản
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<string>("");
  const [sku, setSku] = useState("");
  const [weight, setWeight] = useState<string>("");
  const [length, setLength] = useState<string>("");
  const [width, setWidth] = useState<string>("");
  const [height, setHeight] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [stockQuantity, setStockQuantity] = useState<string>("");
  const [hasVariants, setHasVariants] = useState(false);

  // State ảnh thumbnail
  const [existingThumbnailUrl, setExistingThumbnailUrl] = useState<
    string | null
  >(null);
  const [newThumbnailFile, setNewThumbnailFile] = useState<File | null>(null);
  const [newThumbnailPreview, setNewThumbnailPreview] = useState<string | null>(
    null,
  );

  // State gallery: ảnh cũ giữ lại + ảnh mới
  const [existingGalleryImages, setExistingGalleryImages] = useState<string[]>(
    [],
  );
  const [newGalleryFiles, setNewGalleryFiles] = useState<File[]>([]);
  const [newGalleryPreviews, setNewGalleryPreviews] = useState<string[]>([]);

  // State biến thể
  const [variants, setVariants] = useState<EditVariantFormItem[]>([]);

  // Cleanup object URLs khi unmount
  useEffect(() => {
    return () => {
      if (newThumbnailPreview) URL.revokeObjectURL(newThumbnailPreview);
      newGalleryPreviews.forEach((url) => URL.revokeObjectURL(url));
      variants.forEach((v) =>
        v.newImagePreviews.forEach((url) => URL.revokeObjectURL(url)),
      );
    };
  }, []);

  // Fetch danh mục và chi tiết sản phẩm song song khi mount
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
        prefillForm(product, allCategories);
      } catch (error: any) {
        const msg =
          error?.payload?.message ||
          error?.message ||
          "Không thể tải thông tin sản phẩm.";
        toast.error(Array.isArray(msg) ? msg.join(", ") : msg);
        router.push("/seller/products");
      } finally {
        setIsLoadingProduct(false);
      }
    };
    fetchData();
  }, [productId]);

  // Pre-fill toàn bộ form từ dữ liệu sản phẩm
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

    // Pre-fill thumbnail
    if (product.thumbnail_url && typeof product.thumbnail_url === "string") {
      setExistingThumbnailUrl(product.thumbnail_url);
    }

    // Pre-fill gallery: lấy URLs từ aggregated_gallery bỏ thumbnail
    const thumbnailUrl =
      typeof product.thumbnail_url === "string" ? product.thumbnail_url : null;
    const galleryUrls = product.aggregated_gallery.filter(
      (url) => url !== thumbnailUrl,
    );
    setExistingGalleryImages(galleryUrls);

    // Pre-fill danh mục: tìm parent của category hiện tại
    if (product.category) {
      const currentCategory = allCategories.find(
        (c) => c.id === product.category?.id,
      );
      if (currentCategory?.parent) {
        setSelectedParentId(currentCategory.parent.id);
        setCategoryId(currentCategory.id);
      } else if (currentCategory) {
        // Danh mục gốc (không có parent) — set trực tiếp
        setSelectedParentId(currentCategory.id);
        setCategoryId(currentCategory.id);
      }
    }

    // Pre-fill biến thể
    if (product.has_variants && product.variants.length > 0) {
      const editVariants: EditVariantFormItem[] = product.variants.map((v) => ({
        id: v.id,
        name: v.name,
        sku: v.sku || "",
        additional_price: v.additional_price,
        stock_quantity: v.stock_quantity,
        existingImages: v.images,
        newImages: [],
        newImagePreviews: [],
      }));
      setVariants(editVariants);
    }
  };

  // Danh mục gốc và con
  const rootCategories = categories.filter((c) => !c.parent);
  const childCategories = selectedParentId
    ? categories.filter((c) => c.parent?.id === selectedParentId)
    : [];

  const handleParentChange = (parentId: string) => {
    setSelectedParentId(parentId);
    setCategoryId("");
  };

  // Dropzone thumbnail mới
  const { getRootProps: getThumbProps, getInputProps: getThumbInputProps } =
    useDropzone({
      accept: { "image/*": [] },
      multiple: false,
      onDrop: (acceptedFiles) => {
        const file = acceptedFiles[0];
        if (!file) return;
        if (newThumbnailPreview) URL.revokeObjectURL(newThumbnailPreview);
        setNewThumbnailFile(file);
        setNewThumbnailPreview(URL.createObjectURL(file));
      },
    });

  // Dropzone gallery mới
  const totalGalleryCount =
    existingGalleryImages.length + newGalleryFiles.length;
  const remainingGallerySlots = 5 - totalGalleryCount;

  const { getRootProps: getGalleryProps, getInputProps: getGalleryInputProps } =
    useDropzone({
      accept: { "image/*": [] },
      multiple: true,
      disabled: remainingGallerySlots <= 0,
      onDrop: (acceptedFiles) => {
        const filesToAdd = acceptedFiles.slice(0, remainingGallerySlots);
        const newPreviews = filesToAdd.map((f) => URL.createObjectURL(f));
        setNewGalleryFiles((prev) => [...prev, ...filesToAdd]);
        setNewGalleryPreviews((prev) => [...prev, ...newPreviews]);
      },
    });

  // Xóa ảnh gallery cũ (chỉ bỏ khỏi danh sách giữ lại, không gọi API)
  const handleRemoveExistingGallery = (imageUrl: string) => {
    setExistingGalleryImages((prev) => prev.filter((url) => url !== imageUrl));
  };

  // Xóa ảnh gallery mới chưa upload
  const handleRemoveNewGallery = (index: number) => {
    URL.revokeObjectURL(newGalleryPreviews[index]);
    setNewGalleryFiles((prev) => prev.filter((_, i) => i !== index));
    setNewGalleryPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // Handlers biến thể
  const handleAddVariant = () => {
    setVariants((prev) => [...prev, createEmptyEditVariant()]);
  };

  const handleRemoveVariant = (index: number) => {
    const variant = variants[index];
    variant.newImagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setVariants((prev) => prev.filter((_, i) => i !== index));
  };

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
  };

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
  };

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
  };

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

  // Validate form
  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!name.trim()) newErrors.name = "Tên sản phẩm không được để trống.";
    if (!price || parseFloat(price) < 0)
      newErrors.price = "Giá sản phẩm không hợp lệ.";
    if (!weight || parseFloat(weight) < 1)
      newErrors.weight = "Trọng lượng phải ít nhất 1 gram.";
    if (!categoryId) newErrors.category_id = "Vui lòng chọn danh mục.";

    if (!hasVariants) {
      if (!stockQuantity || parseInt(stockQuantity) < 0) {
        newErrors.stock_quantity = "Tồn kho không hợp lệ.";
      }
    } else {
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
          // Biến thể phải có ít nhất 1 ảnh (cũ hoặc mới)
          const totalVariantImages =
            variant.existingImages.length + variant.newImages.length;
          if (totalVariantImages === 0) {
            newErrors[`variant_${i}_images`] = "Biến thể cần ít nhất 1 ảnh.";
          }
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Build FormData và submit PATCH
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast.error("Vui lòng kiểm tra lại các trường bắt buộc.");
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();

      // Append các trường cơ bản
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

      // Tồn kho gốc (chỉ khi không có biến thể)
      if (!hasVariants && stockQuantity) {
        formData.append("stock_quantity", stockQuantity);
      }

      // Thumbnail mới (nếu có chọn)
      if (newThumbnailFile) {
        formData.append("thumbnail", newThumbnailFile);
      }

      // Gallery: ảnh cũ giữ lại (JSON string) + ảnh mới
      formData.append(
        "existingGalleryImages",
        JSON.stringify(existingGalleryImages),
      );
      newGalleryFiles.forEach((file) => {
        formData.append("general_gallery", file);
      });

      // Biến thể và ảnh biến thể
      if (hasVariants) {
        // Build variants JSON với imageCount = số ảnh MỚI (không tính ảnh cũ)
        const variantsData = variants.map((v) => ({
          ...(v.id ? { id: v.id } : {}),
          name: v.name,
          sku: v.sku || undefined,
          additional_price: v.additional_price,
          stock_quantity: v.stock_quantity,
          existingImages: v.existingImages,
          imageCount: v.newImages.length,
        }));
        formData.append("variants", JSON.stringify(variantsData));

        // Flatten ảnh mới của các biến thể theo đúng thứ tự
        variants.forEach((v) => {
          v.newImages.forEach((imageFile) => {
            formData.append("variant_images", imageFile);
          });
        });
      }

      await productsApiRequest.updateProduct(productId, formData);
      toast.success("Cập nhật sản phẩm thành công!");
      router.push("/seller/products");
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

  // Loading skeleton
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

  const displayThumbnail = newThumbnailPreview || existingThumbnailUrl;

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-1.5 rounded-lg border hover:bg-muted transition"
        >
          <ChevronLeft className="h-4 w-4" />
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
        {/* Thông tin cơ bản */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-lg leading-none border-b pb-3">
            Thông tin cơ bản
          </h3>
          <Field>
            <FieldLabel htmlFor="edit-name">Tên sản phẩm *</FieldLabel>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
                onChange={(e) => setPrice(e.target.value)}
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

        {/* Danh mục */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-lg leading-none border-b pb-3">
            Danh mục
          </h3>
          <div className="grid grid-cols-2 gap-4">
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
            <Field>
              <FieldLabel>Danh mục con *</FieldLabel>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
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

        {/* Logistics */}
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
                onChange={(e) => setWeight(e.target.value)}
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

        {/* Hình ảnh */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
          <h3 className="font-semibold text-lg leading-none border-b pb-3">
            Hình ảnh sản phẩm
          </h3>

          {/* Thumbnail */}
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

          {/* Gallery */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">
              Ảnh bộ sưu tập (tối đa 5 ảnh)
            </p>
            <div className="flex flex-wrap gap-3">
              {/* Ảnh cũ giữ lại */}
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
              {/* Ảnh mới preview */}
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
              {/* Slot upload thêm */}
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

        {/* Tồn kho & Biến thể */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="font-semibold text-lg leading-none">
              Tồn kho & Biến thể
            </h3>
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

          {/* Tồn kho gốc */}
          {!hasVariants && (
            <Field>
              <FieldLabel htmlFor="edit-stock">Số lượng tồn kho *</FieldLabel>
              <Input
                id="edit-stock"
                type="number"
                min={0}
                value={stockQuantity}
                onChange={(e) => setStockQuantity(e.target.value)}
                aria-invalid={!!errors.stock_quantity}
                className="max-w-[200px]"
              />
              {errors.stock_quantity && (
                <FieldError>{errors.stock_quantity}</FieldError>
              )}
            </Field>
          )}

          {/* Variant rows */}
          {hasVariants && (
            <div className="space-y-4">
              {errors.variants && <FieldError>{errors.variants}</FieldError>}
              {variants.map((variant, idx) => (
                <div
                  key={variant.id || `new-${idx}`}
                  className="rounded-lg border bg-muted/20 p-4 space-y-3 relative"
                >
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
              <button
                type="button"
                onClick={handleAddVariant}
                className="flex items-center text-xs font-semibold px-4 py-2 border-2 border-dashed border-violet-400 text-violet-600 dark:text-violet-400 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950/20 transition w-full justify-center"
              >
                <Plus className="h-4 w-4 mr-1.5" /> Thêm biến thể mới
              </button>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center text-xs font-semibold px-4 py-2 border rounded-lg hover:bg-muted transition bg-background"
          >
            Hủy
          </button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-lg font-bold shadow-md shadow-violet-500/25 transition"
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
      </form>
    </div>
  );
}
