"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";

import sellerProductsApiRequest from "@/apiRequests/products/seller-products";
import categoriesApiRequest from "@/apiRequests/products/categories";
import { CategoryResponseType } from "@/schemaValidations/products/categories.schema";
import { getErrorMessage } from "@/lib/http";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";

// Kiểu dữ liệu cho 1 row biến thể trong form (UI state, không phải DTO)
type VariantFormItem = {
  name: string;
  sku: string;
  additional_price: number;
  stock_quantity: number;
  images: File[];
  imagePreviews: string[];
};

// Kiểu dữ liệu lỗi validation thủ công
type FormErrors = {
  name?: string;
  price?: string;
  weight?: string;
  category_id?: string;
  stock_quantity?: string;
  thumbnail?: string;
  general_gallery?: string;
  variants?: string;
  [key: string]: string | undefined;
};

// Tạo 1 row biến thể rỗng mặc định
function createEmptyVariant(): VariantFormItem {
  return {
    name: "",
    sku: "",
    additional_price: 0,
    stock_quantity: 0,
    images: [],
    imagePreviews: [],
  };
}

// Component Dropzone cho ảnh biến thể (tối đa 3 ảnh)
function VariantImageDropzone({
  variantIndex,
  images,
  imagePreviews,
  onAddImages,
  onRemoveImage,
}: {
  variantIndex: number;
  images: File[];
  imagePreviews: string[];
  onAddImages: (index: number, files: File[]) => void;
  onRemoveImage: (variantIndex: number, imageIndex: number) => void;
}) {
  const remainingSlots = 3 - images.length;

  const { getRootProps, getInputProps } = useDropzone({
    accept: { "image/*": [] },
    multiple: true,
    maxFiles: remainingSlots,
    disabled: remainingSlots <= 0,
    maxSize: 10 * 1024 * 1024,
    onDrop: (acceptedFiles) => {
      const filesToAdd = acceptedFiles.slice(0, remainingSlots);
      onAddImages(variantIndex, filesToAdd);
    },
    onDropRejected: (fileRejections) => {
      fileRejections.forEach((rejection) => {
        const { file, errors } = rejection;
        errors.forEach((err) => {
          if (err.code === "file-too-large") {
            toast.error(`Ảnh biến thể "${file.name}" vượt quá 10MB. Vui lòng chọn ảnh nhỏ hơn.`);
          } else if (err.code === "file-invalid-type") {
            toast.error(`File "${file.name}" không đúng định dạng. Chỉ chấp nhận các file ảnh.`);
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
        Ảnh biến thể * (tối đa 3)
      </p>
      <div className="flex flex-wrap gap-2">
        {imagePreviews.map((previewUrl, imgIdx) => (
          <div
            key={imgIdx}
            className="relative h-16 w-16 rounded-lg border overflow-hidden group bg-zinc-100 dark:bg-zinc-900"
          >
            <img
              src={previewUrl}
              alt={`Ảnh biến thể ${imgIdx + 1}`}
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => onRemoveImage(variantIndex, imgIdx)}
              className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-rose-600/90 text-white opacity-0 group-hover:opacity-100 transition"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
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

export default function CreateProductPage() {
  const router = useRouter();

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

  // State ảnh
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);

  // State biến thể
  const [variants, setVariants] = useState<VariantFormItem[]>([
    createEmptyVariant(),
  ]);

  // State submit
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // Fetch danh mục khi mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await categoriesApiRequest.getAll();
        setCategories(res.data ?? []);
      } catch {
        toast.error("Không thể tải danh sách danh mục.");
      }
    };
    fetchCategories();
  }, []);

  // Cleanup object URLs khi unmount
  useEffect(() => {
    return () => {
      if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
      galleryPreviews.forEach((url) => URL.revokeObjectURL(url));
      variants.forEach((v) =>
        v.imagePreviews.forEach((url) => URL.revokeObjectURL(url)),
      );
    };
  }, []);

  // Danh mục gốc (parent = null) và phải có ít nhất 1 danh mục con
  const rootCategories = categories.filter(
    (c) => !c.parent && categories.some((child) => child.parent?.id === c.id),
  );

  // Danh mục con của parent đang chọn
  const childCategories = selectedParentId
    ? categories.filter((c) => c.parent?.id === selectedParentId)
    : [];

  // Khi chọn parent → reset child selection
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

  // Khi toggle has_variants → reset stock_quantity gốc hoặc variants
  const handleToggleVariants = (checked: boolean) => {
    setHasVariants(checked);
    if (checked) {
      setStockQuantity("");
      if (variants.length === 0) setVariants([createEmptyVariant()]);
      if (errors.stock_quantity) {
        setErrors((prev) => ({ ...prev, stock_quantity: undefined }));
      }
    } else {
      setVariants([createEmptyVariant()]);
      if (errors.variants) {
        setErrors((prev) => ({ ...prev, variants: undefined }));
      }
    }
  };

  // Dropzone thumbnail
  const { getRootProps: getThumbProps, getInputProps: getThumbInputProps } =
    useDropzone({
      accept: { "image/*": [] },
      multiple: false,
      maxSize: 10 * 1024 * 1024,
      onDrop: (acceptedFiles) => {
        const file = acceptedFiles[0];
        if (!file) return;
        if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
        setThumbnailFile(file);
        setThumbnailPreview(URL.createObjectURL(file));
        if (errors.thumbnail) {
          setErrors((prev) => ({ ...prev, thumbnail: undefined }));
        }
      },
      onDropRejected: (fileRejections) => {
        fileRejections.forEach((rejection) => {
          const { file, errors } = rejection;
          errors.forEach((err) => {
            if (err.code === "file-too-large") {
              toast.error(`Ảnh đại diện "${file.name}" vượt quá 10MB. Vui lòng chọn ảnh nhỏ hơn.`);
            } else if (err.code === "file-invalid-type") {
              toast.error(`File "${file.name}" không đúng định dạng. Chỉ chấp nhận các file ảnh.`);
            } else {
              toast.error(`Lỗi tải file: ${err.message}`);
            }
          });
        });
      },
    });

  // Dropzone gallery (tối đa 5 ảnh)
  const remainingGallerySlots = 5 - galleryFiles.length;
  const { getRootProps: getGalleryProps, getInputProps: getGalleryInputProps } =
    useDropzone({
      accept: { "image/*": [] },
      multiple: true,
      disabled: remainingGallerySlots <= 0,
      maxSize: 10 * 1024 * 1024,
      onDrop: (acceptedFiles) => {
        const filesToAdd = acceptedFiles.slice(0, remainingGallerySlots);
        const newPreviews = filesToAdd.map((f) => URL.createObjectURL(f));
        setGalleryFiles((prev) => [...prev, ...filesToAdd]);
        setGalleryPreviews((prev) => [...prev, ...newPreviews]);
        if (errors.general_gallery) {
          setErrors((prev) => ({ ...prev, general_gallery: undefined }));
        }
      },
      onDropRejected: (fileRejections) => {
        fileRejections.forEach((rejection) => {
          const { file, errors } = rejection;
          errors.forEach((err) => {
            if (err.code === "file-too-large") {
              toast.error(`Ảnh bộ sưu tập "${file.name}" vượt quá 10MB. Vui lòng chọn ảnh nhỏ hơn.`);
            } else if (err.code === "file-invalid-type") {
              toast.error(`File "${file.name}" không đúng định dạng. Chỉ chấp nhận các file ảnh.`);
            } else {
              toast.error(`Lỗi tải file: ${err.message}`);
            }
          });
        });
      },
    });

  const handleRemoveGallery = (index: number) => {
    URL.revokeObjectURL(galleryPreviews[index]);
    setGalleryFiles((prev) => prev.filter((_, i) => i !== index));
    setGalleryPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // Handlers cho variant rows
  const handleAddVariant = () => {
    setVariants((prev) => [...prev, createEmptyVariant()]);
    if (errors.variants) {
      setErrors((prev) => ({ ...prev, variants: undefined }));
    }
  };

  const handleRemoveVariant = (index: number) => {
    const variant = variants[index];
    variant.imagePreviews.forEach((url) => URL.revokeObjectURL(url));
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

  const handleVariantChange = (
    index: number,
    field: keyof Omit<VariantFormItem, "images" | "imagePreviews">,
    value: string | number,
  ) => {
    setVariants((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)),
    );

    // Clear dynamic error key when modified
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

  const handleAddVariantImages = (variantIndex: number, files: File[]) => {
    const newPreviews = files.map((f) => URL.createObjectURL(f));
    setVariants((prev) =>
      prev.map((v, i) =>
        i === variantIndex
          ? {
              ...v,
              images: [...v.images, ...files],
              imagePreviews: [...v.imagePreviews, ...newPreviews],
            }
          : v,
      ),
    );
    const errKeyImages = `variant_${variantIndex}_images`;
    if (errors[errKeyImages]) {
      setErrors((prev) => ({ ...prev, [errKeyImages]: undefined }));
    }
  };

  const handleRemoveVariantImage = (
    variantIndex: number,
    imageIndex: number,
  ) => {
    setVariants((prev) =>
      prev.map((v, i) => {
        if (i !== variantIndex) return v;
        URL.revokeObjectURL(v.imagePreviews[imageIndex]);
        return {
          ...v,
          images: v.images.filter((_, idx) => idx !== imageIndex),
          imagePreviews: v.imagePreviews.filter((_, idx) => idx !== imageIndex),
        };
      }),
    );
  };

  // Validate form trước khi submit
  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!name.trim()) newErrors.name = "Tên sản phẩm không được để trống.";
    if (!price || parseFloat(price) < 0)
      newErrors.price = "Giá sản phẩm không hợp lệ.";
    if (!weight || parseFloat(weight) < 1)
      newErrors.weight = "Trọng lượng phải ít nhất 1 gram.";
    if (!categoryId) newErrors.category_id = "Vui lòng chọn danh mục.";
    if (!thumbnailFile) newErrors.thumbnail = "Vui lòng chọn ảnh đại diện.";
    if (galleryFiles.length === 0)
      newErrors.general_gallery = "Vui lòng chọn ít nhất 1 ảnh bộ sưu tập.";

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
          if (variant.images.length === 0) {
            newErrors[`variant_${i}_images`] = "Biến thể cần ít nhất 1 ảnh.";
          }
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Build FormData và submit
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
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
      if (description.trim())
        formData.append("description", description.trim());
      formData.append("price", price);
      if (sku.trim()) formData.append("sku", sku.trim());
      formData.append("weight", weight);
      if (length) formData.append("length", length);
      if (width) formData.append("width", width);
      if (height) formData.append("height", height);
      formData.append("category_id", categoryId);
      formData.append("has_variants", String(hasVariants));

      // Append tồn kho gốc (chỉ khi không có biến thể)
      if (!hasVariants && stockQuantity) {
        formData.append("stock_quantity", stockQuantity);
      }

      // Append file ảnh thumbnail (bắt buộc)
      formData.append("thumbnail", thumbnailFile!);

      // Append ảnh gallery
      galleryFiles.forEach((file) => {
        formData.append("general_gallery", file);
      });

      // Append biến thể và ảnh biến thể (flatten array theo đúng cơ chế BE)
      if (hasVariants) {
        // Build mảng variants JSON (chứa imageCount để BE biết cắt ảnh)
        const variantsData = variants.map((v) => ({
          name: v.name,
          sku: v.sku || undefined,
          additional_price: v.additional_price,
          stock_quantity: v.stock_quantity,
          imageCount: v.images.length,
        }));
        formData.append("variants", JSON.stringify(variantsData));

        // Flatten tất cả ảnh biến thể vào 1 key theo đúng thứ tự
        variants.forEach((v) => {
          v.images.forEach((imageFile) => {
            formData.append("variant_images", imageFile);
          });
        });
      }

      await sellerProductsApiRequest.createProduct(formData);
      toast.success("Tạo sản phẩm thành công!");
      router.push("/seller/products");
    } catch (error: any) {
      const msg = getErrorMessage(error);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 w-full animate-fade-in pb-10">
      {/* Header */}
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
            Đăng sản phẩm mới
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Điền đầy đủ thông tin để đăng sản phẩm lên cửa hàng.
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
            <FieldLabel htmlFor="product-name">Tên sản phẩm *</FieldLabel>
            <Input
              id="product-name"
              placeholder="Nhập tên sản phẩm..."
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              aria-invalid={!!errors.name}
            />
            {errors.name && <FieldError>{errors.name}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor="product-description">
              Mô tả sản phẩm
            </FieldLabel>
            <Textarea
              id="product-description"
              placeholder="Mô tả chi tiết về sản phẩm..."
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="product-price">Giá bán (VNĐ) *</FieldLabel>
              <Input
                id="product-price"
                type="number"
                min={0}
                placeholder="150000"
                value={price}
                onChange={(e) => handlePriceChange(e.target.value)}
                aria-invalid={!!errors.price}
              />
              {errors.price && <FieldError>{errors.price}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="product-sku">Mã SKU</FieldLabel>
              <Input
                id="product-sku"
                placeholder="SKU-001"
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

        {/* Logistics */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-lg leading-none border-b pb-3">
            Thông số đóng gói
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field>
              <FieldLabel htmlFor="product-weight">
                Trọng lượng (g) *
              </FieldLabel>
              <Input
                id="product-weight"
                type="number"
                min={1}
                placeholder="500"
                value={weight}
                onChange={(e) => handleWeightChange(e.target.value)}
                aria-invalid={!!errors.weight}
              />
              {errors.weight && <FieldError>{errors.weight}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="product-length">Dài (cm)</FieldLabel>
              <Input
                id="product-length"
                type="number"
                min={0}
                placeholder="30"
                value={length}
                onChange={(e) => setLength(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="product-width">Rộng (cm)</FieldLabel>
              <Input
                id="product-width"
                type="number"
                min={0}
                placeholder="20"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="product-height">Cao (cm)</FieldLabel>
              <Input
                id="product-height"
                type="number"
                min={0}
                placeholder="10"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
            </Field>
          </div>
        </div>

        {/* Upload ảnh */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
          <h3 className="font-semibold text-lg leading-none border-b pb-3">
            Hình ảnh sản phẩm
          </h3>

          {/* Thumbnail */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">Ảnh đại diện (Thumbnail) *</p>
            <div
              {...getThumbProps()}
              className="relative h-36 w-36 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center cursor-pointer hover:border-violet-500 hover:bg-violet-50/20 dark:hover:bg-violet-950/10 transition overflow-hidden group"
            >
              <input {...getThumbInputProps()} />
              {thumbnailPreview ? (
                <>
                  <img
                    src={thumbnailPreview}
                    alt="Thumbnail"
                    className="w-full h-full object-cover"
                  />
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
            {errors.thumbnail && <FieldError>{errors.thumbnail}</FieldError>}
          </div>

          {/* Gallery */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">
              Ảnh bộ sưu tập * (tối đa 5 ảnh)
            </p>
            <div className="flex flex-wrap gap-3">
              {galleryPreviews.map((previewUrl, idx) => (
                <div
                  key={idx}
                  className="relative h-24 w-24 rounded-lg border overflow-hidden group bg-zinc-100 dark:bg-zinc-900"
                >
                  <img
                    src={previewUrl}
                    alt={`Gallery ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveGallery(idx)}
                    className="absolute top-1 right-1 p-0.5 rounded-full bg-rose-600/90 text-white opacity-0 group-hover:opacity-100 transition"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
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
            {errors.general_gallery && (
              <FieldError>{errors.general_gallery}</FieldError>
            )}
          </div>
        </div>

        {/* Tồn kho & Biến thể */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="font-semibold text-lg leading-none">
              Tồn kho & Biến thể
            </h3>
            {/* Toggle has_variants */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs font-semibold text-muted-foreground">
                Sản phẩm có nhiều phiên bản
              </span>
              <div
                onClick={() => handleToggleVariants(!hasVariants)}
                className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${hasVariants ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${hasVariants ? "translate-x-5" : "translate-x-0"}`}
                />
              </div>
            </label>
          </div>

          {/* Tồn kho gốc (khi không có biến thể) */}
          {!hasVariants && (
            <Field>
              <FieldLabel htmlFor="stock-quantity">
                Số lượng tồn kho *
              </FieldLabel>
              <Input
                id="stock-quantity"
                type="number"
                min={0}
                placeholder="100"
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

          {/* Dynamic Variant Rows */}
          {hasVariants && (
            <div className="space-y-4">
              {errors.variants && <FieldError>{errors.variants}</FieldError>}
              {variants.map((variant, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border bg-muted/20 p-4 space-y-3 relative"
                >
                  {/* Nút xóa biến thể */}
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
                  <p className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wide">
                    Biến thể #{idx + 1}
                  </p>
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
                        placeholder="0"
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
                        placeholder="50"
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
                  <VariantImageDropzone
                    variantIndex={idx}
                    images={variant.images}
                    imagePreviews={variant.imagePreviews}
                    onAddImages={handleAddVariantImages}
                    onRemoveImage={handleRemoveVariantImage}
                  />
                  {errors[`variant_${idx}_images`] && (
                    <FieldError>{errors[`variant_${idx}_images`]}</FieldError>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddVariant}
                className="flex items-center text-xs font-semibold px-4 py-2 border-2 border-dashed border-violet-400 text-violet-600 dark:text-violet-400 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950/20 transition w-2/5 mx-auto justify-center"
              >
                <Plus className="h-4 w-4 mr-1.5" /> Thêm biến thể
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
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang đăng sản
                  phẩm...
                </>
              ) : (
                <>
                  <Package className="h-4 w-4" /> Đăng sản phẩm
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
