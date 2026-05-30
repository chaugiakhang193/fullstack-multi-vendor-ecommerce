"use client";

import React, { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Store,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  X,
} from "lucide-react";

import sellerShopsApiRequest from "@/apiRequests/shops/seller-shops";
import categoriesApiRequest from "@/apiRequests/products/categories";
import {
  CreateShopBody,
  CreateShopBodyType,
  ShopResponseType,
} from "@/schemaValidations/shops/shops.schema";
import { CategoryResponseType } from "@/schemaValidations/products/categories.schema";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export default function SellerSetupPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isRejected = user?.status === "rejected";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingShop, setIsLoadingShop] = useState(false);
  const [existingShop, setExistingShop] = useState<ShopResponseType | null>(
    null,
  );
  const [existingGallery, setExistingGallery] = useState<
    { id: string; url: string }[]
  >([]);

  // Business categories states
  const [categories, setCategories] = useState<CategoryResponseType[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  // File upload states
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);

  // Preview URLs
  const logoPreview = useMemo(() => {
    if (logoFile) return URL.createObjectURL(logoFile);
    return existingShop?.logo_url || null;
  }, [logoFile, existingShop]);

  const bannerPreview = useMemo(() => {
    if (bannerFile) return URL.createObjectURL(bannerFile);
    return existingShop?.banner_url || null;
  }, [bannerFile, existingShop]);

  const galleryPreviews = useMemo(() => {
    return galleryFiles.map((file) => URL.createObjectURL(file));
  }, [galleryFiles]);

  // Cleanup object URLs safely
  React.useEffect(() => {
    return () => {
      if (logoPreview && logoPreview.startsWith("blob:"))
        URL.revokeObjectURL(logoPreview);
      if (bannerPreview && bannerPreview.startsWith("blob:"))
        URL.revokeObjectURL(bannerPreview);
      galleryPreviews.forEach((url) => {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
    };
  }, [logoPreview, bannerPreview, galleryPreviews]);

  // React Hook Form setup
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateShopBodyType>({
    resolver: zodResolver(CreateShopBody),
    defaultValues: {
      name: "",
      description: "",
      pickup_address: "",
      bank_account_name: "",
      bank_account_number: "",
      bank_name: "",
      categoryIds: [],
    },
  });

  const selectedCategoryIds = watch("categoryIds") || [];

  const handleCategoryToggle = (id: string) => {
    const currentIds = [...selectedCategoryIds];
    const index = currentIds.indexOf(id);
    if (index > -1) {
      currentIds.splice(index, 1);
    } else {
      currentIds.push(id);
    }
    setValue("categoryIds", currentIds, { shouldValidate: true });
  };

  // Fetch business categories (only root ones, as backend restricts shops to root categories)
  React.useEffect(() => {
    const fetchCategories = async () => {
      setIsLoadingCategories(true);
      try {
        const res = await categoriesApiRequest.getAll();
        const roots = (res.data || []).filter((c) => !c.parent);
        setCategories(roots);
      } catch (error) {
        console.error("Lỗi lấy danh mục:", error);
        toast.error("Không thể tải danh mục kinh doanh.");
      } finally {
        setIsLoadingCategories(false);
      }
    };
    fetchCategories();
  }, []);

  // Fetch shop details if rejected
  React.useEffect(() => {
    if (isRejected) {
      const fetchShop = async () => {
        setIsLoadingShop(true);
        try {
          const res = await sellerShopsApiRequest.getMyShop();
          const shop = res.data;
          setExistingShop(shop);
          setExistingGallery(shop.gallery || []);

          // Prefill values
          let bank_name = "";
          let bank_account_number = "";
          let bank_account_name = "";
          if (shop.bank_account_info) {
            try {
              const parsed = JSON.parse(shop.bank_account_info);
              if (parsed && typeof parsed === "object") {
                if (Array.isArray(parsed)) {
                  const flatArray = parsed.map((item: any) =>
                    Array.isArray(item) ? item[0] : item,
                  );
                  bank_name = String(flatArray[0] || "");
                  bank_account_number = String(flatArray[1] || "");
                  bank_account_name = String(flatArray[2] || "");
                } else {
                  bank_name = parsed.bank_name || "";
                  bank_account_number = parsed.bank_account_number || "";
                  bank_account_name = parsed.bank_account_name || "";
                }
              }
            } catch (e) {
              const parts = shop.bank_account_info.split(" - ");
              bank_name = parts[0] || "";
              bank_account_number = parts[1] || "";
              bank_account_name = parts[2] || "";
            }
          }
          reset({
            name: shop.name,
            description: shop.description || "",
            pickup_address: shop.pickup_address || "",
            bank_name,
            bank_account_number,
            bank_account_name,
            categoryIds: shop.categories?.map((c: any) => c.id) || [],
          });
        } catch (error) {
          console.error("Lỗi lấy thông tin cửa hàng:", error);
          toast.error("Không thể lấy thông tin cửa hàng cũ.");
        } finally {
          setIsLoadingShop(false);
        }
      };
      fetchShop();
    }
  }, [isRejected, reset]);

  // Xóa ảnh gallery đã tồn tại
  const handleDeleteExistingGalleryImage = async (assetId: string) => {
    try {
      await sellerShopsApiRequest.deleteGalleryImage(assetId);
      setExistingGallery((prev) => prev.filter((item) => item.id !== assetId));
      toast.success("Xóa ảnh thành công");
    } catch (error) {
      toast.error("Không thể xóa ảnh. Vui lòng thử lại.");
    }
  };

  // Handle form submission
  const onSubmit = async (values: CreateShopBodyType) => {
    // Validate file uploads
    const hasLogo = logoFile || existingShop?.logo_url;
    const hasBanner = bannerFile || existingShop?.banner_url;
    const totalGalleryCount = existingGallery.length + galleryFiles.length;

    if (!hasLogo) {
      toast.error("Vui lòng tải lên logo cửa hàng");
      return;
    }
    if (!hasBanner) {
      toast.error("Vui lòng tải lên banner cửa hàng");
      return;
    }
    if (totalGalleryCount === 0) {
      toast.error("Vui lòng tải lên ít nhất 1 ảnh bộ sưu tập (tối đa 3 ảnh)");
      return;
    }
    if (totalGalleryCount > 3) {
      toast.error("Tối đa 3 ảnh bộ sưu tập");
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();

      // Append text fields
      formData.append("name", values.name);
      formData.append("pickup_address", values.pickup_address);
      if (values.description) {
        formData.append("description", values.description);
      }

      // 🔴 MERGE 3 trường ngân hàng thành 1 trường bank_account_info
      // Lưu dưới dạng chuỗi JSON object
      const bankAccountInfo = JSON.stringify({
        bank_name: values.bank_name,
        bank_account_number: values.bank_account_number,
        bank_account_name: values.bank_account_name,
      });
      formData.append("bank_account_info", bankAccountInfo);

      // Append categoryIds (Backend expects array)
      values.categoryIds.forEach((id) => {
        formData.append("categoryIds[]", id);
      });

      // Append file uploads if selected
      if (logoFile) {
        formData.append("logo", logoFile);
      }
      if (bannerFile) {
        formData.append("banner", bannerFile);
      }
      galleryFiles.forEach((file) => {
        formData.append("gallery", file);
      });

      if (isRejected) {
        await sellerShopsApiRequest.reApplyShop(formData);
      } else {
        await sellerShopsApiRequest.setupInitialShop(formData);
      }

      // Refresh token to update the cookies/state to 'pending_approval'
      try {
        await useAuthStore.getState().silentRefresh();
      } catch (refreshError) {
        console.error("Lỗi cập nhật phiên đăng nhập:", refreshError);
      }

      toast.success(
        isRejected
          ? "Cập nhật và nộp lại yêu cầu thành công!"
          : "Tạo cửa hàng thành công! Vui lòng chờ admin phê duyệt.",
      );
      router.push("/seller/pending");
      router.refresh();
    } catch (error: any) {
      const msg =
        error?.payload?.message ||
        error?.message ||
        "Không thể tạo cửa hàng. Vui lòng thử lại.";
      toast.error(Array.isArray(msg) ? msg.join(", ") : msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle file selection
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Logo không được vượt quá 5MB");
        return;
      }
      setLogoFile(file);
    }
  };

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Banner không được vượt quá 5MB");
        return;
      }
      setBannerFile(file);
    }
  };

  const handleGalleryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const totalCount =
      files.length + galleryFiles.length + existingGallery.length;
    if (totalCount > 3) {
      toast.error("Tối đa 3 ảnh bộ sưu tập (bao gồm cả ảnh cũ đã có)");
      return;
    }
    const validFiles = files.filter((file) => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} vượt quá 5MB`);
        return false;
      }
      return true;
    });
    setGalleryFiles((prev) => [...prev, ...validFiles]);
  };

  const removeGalleryImage = (index: number) => {
    setGalleryFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl shadow-xl">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto h-16 w-16 rounded-full bg-violet-500/10 flex items-center justify-center text-violet-600 mb-4">
            <Store className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-bold">
            Khởi tạo cửa hàng
          </CardTitle>
          <CardDescription className="text-sm mt-1">
            Điền đầy đủ thông tin để tạo cửa hàng của bạn. Admin sẽ phê duyệt
            trong vòng 1-2 ngày làm việc.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {isLoadingShop ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
              <p className="text-sm font-semibold">
                Đang tải thông tin cửa hàng...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {isRejected && (
                <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl p-4 text-sm text-rose-800 dark:text-rose-300 flex gap-3 mb-6">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-rose-950 dark:text-rose-400">
                      Yêu cầu đăng ký đã bị từ chối
                    </p>
                    <p className="mt-1 text-xs opacity-90 text-rose-800 dark:text-rose-300">
                      Yêu cầu đăng ký cửa hàng của bạn đã bị từ chối phê duyệt.
                      Vui lòng kiểm tra hộp thư email của bạn để xem lý do từ
                      chối chi tiết, cập nhật lại các thông tin chưa chính xác
                      bên dưới và nộp lại yêu cầu.
                    </p>
                  </div>
                </div>
              )}
              {/* Thông tin cơ bản */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-violet-600" />
                  Thông tin cơ bản
                </h3>

                <Field>
                  <FieldLabel>
                    Tên cửa hàng <span className="text-rose-500">*</span>
                  </FieldLabel>
                  <Input
                    {...register("name")}
                    placeholder="VD: Cửa hàng quần áo ABC"
                    disabled={isSubmitting}
                  />
                  {errors.name && (
                    <FieldError>{errors.name.message}</FieldError>
                  )}
                </Field>

                <Field>
                  <FieldLabel>Mô tả cửa hàng</FieldLabel>
                  <Textarea
                    {...register("description")}
                    placeholder="Mô tả ngắn gọn về cửa hàng của bạn..."
                    rows={3}
                    disabled={isSubmitting}
                  />
                  {errors.description && (
                    <FieldError>{errors.description.message}</FieldError>
                  )}
                </Field>

                <Field>
                  <FieldLabel>
                    Địa chỉ lấy hàng <span className="text-rose-500">*</span>
                  </FieldLabel>
                  <Input
                    {...register("pickup_address")}
                    placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố"
                    disabled={isSubmitting}
                  />
                  {errors.pickup_address && (
                    <FieldError>{errors.pickup_address.message}</FieldError>
                  )}
                </Field>
              </div>

              {/* Thông tin ngân hàng */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-violet-600" />
                  Thông tin ngân hàng (để rút tiền)
                </h3>

                <Field>
                  <FieldLabel>
                    Tên ngân hàng <span className="text-rose-500">*</span>
                  </FieldLabel>
                  <Input
                    {...register("bank_name")}
                    placeholder="VD: Vietcombank, Techcombank, BIDV..."
                    disabled={isSubmitting}
                  />
                  {errors.bank_name && (
                    <FieldError>{errors.bank_name.message}</FieldError>
                  )}
                </Field>

                <Field>
                  <FieldLabel>
                    Số tài khoản <span className="text-rose-500">*</span>
                  </FieldLabel>
                  <Input
                    {...register("bank_account_number")}
                    placeholder="VD: 123456789"
                    disabled={isSubmitting}
                  />
                  {errors.bank_account_number && (
                    <FieldError>
                      {errors.bank_account_number.message}
                    </FieldError>
                  )}
                </Field>

                <Field>
                  <FieldLabel>
                    Tên chủ tài khoản <span className="text-rose-500">*</span>
                  </FieldLabel>
                  <Input
                    {...register("bank_account_name")}
                    placeholder="VD: NGUYEN VAN A (viết hoa không dấu)"
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Tên sẽ tự động chuyển thành chữ IN HOA
                  </p>
                  {errors.bank_account_name && (
                    <FieldError>{errors.bank_account_name.message}</FieldError>
                  )}
                </Field>
              </div>

              {/* Danh mục kinh doanh */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-violet-600" />
                  Danh mục kinh doanh <span className="text-rose-500">*</span>
                </h3>

                {isLoadingCategories ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground justify-center border rounded-xl bg-background">
                    <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                    Đang tải danh mục...
                  </div>
                ) : categories.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-4 border rounded-xl bg-background text-center">
                    Không tìm thấy danh mục kinh doanh nào khả dụng.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 border rounded-xl bg-background">
                    {categories.map((category) => {
                      const isChecked = selectedCategoryIds.includes(
                        category.id,
                      );
                      return (
                        <label
                          key={category.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-all ${
                            isChecked
                              ? "border-violet-500 bg-violet-50/30 dark:bg-violet-950/15"
                              : "border-zinc-200 dark:border-zinc-800"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleCategoryToggle(category.id)}
                            className="mt-0.5 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 text-violet-600 focus:ring-violet-500 bg-background"
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold">
                              {category.name}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {category.slug}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
                {errors.categoryIds && (
                  <FieldError>
                    {errors.categoryIds.message?.toString()}
                  </FieldError>
                )}
              </div>

              {/* Upload ảnh */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-violet-600" />
                  Hình ảnh cửa hàng
                </h3>

                {/* Logo */}
                <Field>
                  <FieldLabel>
                    Logo cửa hàng <span className="text-rose-500">*</span>
                  </FieldLabel>
                  <div className="flex items-center gap-4">
                    {logoPreview ? (
                      <div className="relative h-20 w-20 rounded-lg border overflow-hidden">
                        <img
                          src={logoPreview}
                          alt="Logo preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setLogoFile(null)}
                          className="absolute top-1 right-1 p-1 bg-rose-500 text-white rounded-full hover:bg-rose-600 transition"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="h-20 w-20 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center cursor-pointer hover:border-violet-500 transition">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoChange}
                          className="hidden"
                          disabled={isSubmitting}
                        />
                        <Upload className="h-6 w-6 text-muted-foreground" />
                      </label>
                    )}
                    <div className="flex-1 text-xs text-muted-foreground">
                      <p>Tỷ lệ khuyến nghị: 1:1 (vuông)</p>
                      <p>Kích thước tối đa: 5MB</p>
                    </div>
                  </div>
                </Field>

                {/* Banner */}
                <Field>
                  <FieldLabel>
                    Banner cửa hàng <span className="text-rose-500">*</span>
                  </FieldLabel>
                  <div className="space-y-2">
                    {bannerPreview ? (
                      <div className="relative w-full h-32 rounded-lg border overflow-hidden">
                        <img
                          src={bannerPreview}
                          alt="Banner preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setBannerFile(null)}
                          className="absolute top-2 right-2 p-1 bg-rose-500 text-white rounded-full hover:bg-rose-600 transition"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="w-full h-32 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex flex-col items-center justify-center cursor-pointer hover:border-violet-500 transition">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleBannerChange}
                          className="hidden"
                          disabled={isSubmitting}
                        />
                        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-xs text-muted-foreground">
                          Nhấn để tải lên banner
                        </p>
                      </label>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Tỷ lệ khuyến nghị: 16:9 | Kích thước tối đa: 5MB
                    </p>
                  </div>
                </Field>

                {/* Gallery */}
                <Field>
                  <FieldLabel>
                    Bộ sưu tập ảnh (1-3 ảnh){" "}
                    <span className="text-rose-500">*</span>
                  </FieldLabel>
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      {/* Render ảnh cũ đã có */}
                      {existingGallery.map((img) => (
                        <div
                          key={img.id}
                          className="relative aspect-square rounded-lg border overflow-hidden"
                        >
                          <img
                            src={img.url}
                            alt="Gallery item"
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteExistingGalleryImage(img.id)
                            }
                            className="absolute top-1 right-1 p-1 bg-rose-500 text-white rounded-full hover:bg-rose-600 transition"
                            disabled={isSubmitting}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}

                      {/* Render ảnh mới chọn */}
                      {galleryPreviews.map((url, index) => (
                        <div
                          key={`new-${index}`}
                          className="relative aspect-square rounded-lg border overflow-hidden"
                        >
                          <img
                            src={url}
                            alt={`New Gallery ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeGalleryImage(index)}
                            className="absolute top-1 right-1 p-1 bg-rose-500 text-white rounded-full hover:bg-rose-600 transition"
                            disabled={isSubmitting}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}

                      {/* Nút upload ảnh nếu chưa đạt tối đa 3 ảnh */}
                      {existingGallery.length + galleryFiles.length < 3 && (
                        <label className="aspect-square rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center cursor-pointer hover:border-violet-500 transition">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleGalleryChange}
                            className="hidden"
                            disabled={isSubmitting}
                          />
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        </label>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Tải lên 1-3 ảnh giới thiệu cửa hàng | Mỗi ảnh tối đa 5MB
                    </p>
                  </div>
                </Field>
              </div>

              {/* Submit button */}
              <div className="pt-4">
                <Button
                  type="submit"
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {isRejected
                        ? "Đang cập nhật & nộp lại..."
                        : "Đang tạo cửa hàng..."}
                    </>
                  ) : (
                    <>
                      <Store className="h-4 w-4 mr-2" />
                      {isRejected
                        ? "Cập nhật & Gửi yêu cầu phê duyệt"
                        : "Tạo cửa hàng"}
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
