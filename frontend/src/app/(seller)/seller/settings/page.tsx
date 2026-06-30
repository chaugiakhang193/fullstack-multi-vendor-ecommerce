'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import {
  Save,
  Store,
  Mail,
  Phone,
  MapPin,
  Info,
  CreditCard,
  Camera,
  Trash2,
  Plus,
  Loader2,
  Image as ImageIcon,
  ShieldCheck,
  ShieldAlert,
  User as UserIcon,
} from 'lucide-react';

import sellerShopsApiRequest from '@/apiRequests/shops/seller-shops';
import userApiRequest from '@/apiRequests/users/users';
import { useAuthStore } from '@/store/useAuthStore';
import { UserAvatar } from '@/components/shared/user-avatar';
import {
  ShopResponseType,
  UpdateSettingsBody,
  UpdateSettingsBodyType,
} from '@/schemaValidations/shops/shops.schema';
import { AddressAutocomplete } from '@/components/shared/address-autocomplete';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldLabel, FieldError } from '@/components/ui/field';
import { getErrorMessage } from '@/lib/http';

export default function SellerSettingsPage() {
  const [shop, setShop] = useState<ShopResponseType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // Upload file states
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [newGalleryFiles, setNewGalleryFiles] = useState<File[]>([]);

  // Avatar cá nhân — lưu độc lập với form shop (upload ngay khi chọn)
  const authUser = useAuthStore((s) => s.user);
  const setAuthUser = useAuthStore((s) => s.setUser);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const avatarPreviewUrl = useMemo(
    () => (avatarFile ? URL.createObjectURL(avatarFile) : null),
    [avatarFile],
  );

  // Local object URL previews
  const logoPreviewUrl = useMemo(() => {
    return logoFile ? URL.createObjectURL(logoFile) : null;
  }, [logoFile]);

  const bannerPreviewUrl = useMemo(() => {
    return bannerFile ? URL.createObjectURL(bannerFile) : null;
  }, [bannerFile]);

  const newGalleryPreviews = useMemo(() => {
    return newGalleryFiles.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
  }, [newGalleryFiles]);

  // Clean up object URLs to avoid memory leaks
  useEffect(() => {
    return () => {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
      if (bannerPreviewUrl) URL.revokeObjectURL(bannerPreviewUrl);
      newGalleryPreviews.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [logoPreviewUrl, bannerPreviewUrl, newGalleryPreviews]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  // Setup react-hook-form
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UpdateSettingsBodyType>({
    resolver: zodResolver(UpdateSettingsBody),
    defaultValues: {
      name: '',
      description: '',
      pickup_address: '',
      bank_name: '',
      account_number: '',
      account_holder: '',
    },
  });

  // Fetch shop data
  const fetchShopData = async () => {
    setIsLoading(true);
    try {
      const res = await sellerShopsApiRequest.getMyShop();
      const shopData = res.data;
      setShop(shopData);

      const info = shopData.bank_account_info;

      // Pre-fill form fields
      reset({
        name: shopData.name,
        description: shopData.description || '',
        pickup_address: shopData.pickup_address || '',
        bank_name: info?.bank_name ?? '',
        account_number: info?.account_number ?? '',
        account_holder: info?.account_holder ?? '',
      });
      if (shopData.lat && shopData.lng) {
        setSelectedCoords({
          lat: parseFloat(shopData.lat),
          lng: parseFloat(shopData.lng),
        });
      }
    } catch (error: any) {
      const errMsg = getErrorMessage(error);
      toast.error(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchShopData();
  }, []);

  // Dropzone for Logo
  const { getRootProps: getLogoProps, getInputProps: getLogoInputProps } =
    useDropzone({
      accept: { 'image/*': [] },
      multiple: false,
      maxSize: 10 * 1024 * 1024,
      onDrop: (acceptedFiles) => {
        if (acceptedFiles?.[0]) {
          setLogoFile(acceptedFiles[0]);
        }
      },
      onDropRejected: (fileRejections) => {
        fileRejections.forEach((rejection) => {
          const { file, errors } = rejection;
          errors.forEach((err) => {
            if (err.code === 'file-too-large') {
              toast.error(
                `Ảnh logo "${file.name}" vượt quá 10MB. Vui lòng chọn ảnh nhỏ hơn.`,
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

  // Avatar cá nhân: upload ngay khi chọn (không qua submit form shop)
  const handleAvatarChange = async (file: File) => {
    setIsUploadingAvatar(true);
    setAvatarFile(file);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await userApiRequest.uploadAvatar(fd);
      setAuthUser(res.data);
      toast.success('Cập nhật ảnh đại diện thành công!');
    } catch (error: any) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsUploadingAvatar(false);
      setAvatarFile(null);
    }
  };

  const { getRootProps: getAvatarProps, getInputProps: getAvatarInputProps } =
    useDropzone({
      accept: { 'image/*': [] },
      multiple: false,
      maxSize: 10 * 1024 * 1024,
      onDrop: (acceptedFiles) => {
        if (acceptedFiles?.[0]) {
          handleAvatarChange(acceptedFiles[0]);
        }
      },
      onDropRejected: (fileRejections) => {
        fileRejections.forEach((rejection) => {
          rejection.errors.forEach((err) => {
            if (err.code === 'file-too-large') {
              toast.error(
                'Ảnh đại diện vượt quá 10MB. Vui lòng chọn ảnh nhỏ hơn.',
              );
            } else if (err.code === 'file-invalid-type') {
              toast.error('File không đúng định dạng. Chỉ chấp nhận ảnh.');
            } else {
              toast.error(`Lỗi tải file: ${err.message}`);
            }
          });
        });
      },
    });

  const displayAvatar = avatarPreviewUrl || authUser?.avatar_url || null;

  // Dropzone for Banner
  const { getRootProps: getBannerProps, getInputProps: getBannerInputProps } =
    useDropzone({
      accept: { 'image/*': [] },
      multiple: false,
      maxSize: 10 * 1024 * 1024,
      onDrop: (acceptedFiles) => {
        if (acceptedFiles?.[0]) {
          setBannerFile(acceptedFiles[0]);
        }
      },
      onDropRejected: (fileRejections) => {
        fileRejections.forEach((rejection) => {
          const { file, errors } = rejection;
          errors.forEach((err) => {
            if (err.code === 'file-too-large') {
              toast.error(
                `Ảnh banner "${file.name}" vượt quá 10MB. Vui lòng chọn ảnh nhỏ hơn.`,
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

  // Dropzone for Gallery (max 3 images)
  const remainingGallerySlots = useMemo(() => {
    if (!shop) return 3;
    const existingCount = shop.gallery?.length || 0;
    return Math.max(0, 3 - existingCount - newGalleryFiles.length);
  }, [shop, newGalleryFiles]);

  const { getRootProps: getGalleryProps, getInputProps: getGalleryInputProps } =
    useDropzone({
      accept: { 'image/*': [] },
      multiple: true,
      maxFiles: remainingGallerySlots,
      disabled: remainingGallerySlots <= 0,
      maxSize: 10 * 1024 * 1024,
      onDrop: (acceptedFiles) => {
        if (acceptedFiles.length > remainingGallerySlots) {
          toast.error(
            `Bạn chỉ được chọn thêm tối đa ${remainingGallerySlots} ảnh.`,
          );
          return;
        }
        setNewGalleryFiles((prev) =>
          [...prev, ...acceptedFiles].slice(
            0,
            3 - (shop?.gallery?.length || 0),
          ),
        );
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
            } else if (err.code === 'too-many-files') {
              toast.error(`Bạn vượt quá số lượng ảnh cho phép của bộ sưu tập.`);
            } else {
              toast.error(`Lỗi tải file: ${err.message}`);
            }
          });
        });
      },
    });

  // Delete existing gallery image (API call)
  const handleDeleteExistingImage = async (assetId: string) => {
    try {
      await sellerShopsApiRequest.deleteGalleryImage(assetId);
      toast.success('Xóa ảnh khỏi bộ sưu tập thành công!');
      fetchShopData();
    } catch (error: any) {
      const errMsg = getErrorMessage(error);
      toast.error(errMsg);
    }
  };

  // Remove newly selected image from upload queue
  const handleRemoveNewImage = (index: number) => {
    setNewGalleryFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit profile changes (including Multipart files)
  const onSubmit = async (data: UpdateSettingsBodyType) => {
    setIsSaving(true);
    const formData = new FormData();

    // Append text fields
    formData.append('name', data.name);
    formData.append('description', data.description || '');
    formData.append('pickup_address', data.pickup_address);
    if (selectedCoords) {
      formData.append('lat', String(selectedCoords.lat));
      formData.append('lng', String(selectedCoords.lng));
    }

    const bankAccountInfoObj = {
      bank_name: data.bank_name,
      account_number: data.account_number,
      account_holder: data.account_holder,
    };
    formData.append('bank_account_info', JSON.stringify(bankAccountInfoObj));

    // Append file fields
    if (logoFile) {
      formData.append('logo', logoFile);
    }
    if (bannerFile) {
      formData.append('banner', bannerFile);
    }
    if (newGalleryFiles.length > 0) {
      newGalleryFiles.forEach((file) => {
        formData.append('gallery', file);
      });
    }

    try {
      await sellerShopsApiRequest.updateMyShop(formData);
      toast.success('Cập nhật thông tin cửa hàng thành công!');
      // Reset file upload states
      setLogoFile(null);
      setBannerFile(null);
      setNewGalleryFiles([]);
      fetchShopData();
    } catch (error: any) {
      const errMsg = getErrorMessage(error);
      toast.error(errMsg);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
        <p className="text-sm text-muted-foreground">
          Đang tải cấu hình cửa hàng...
        </p>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="text-center py-20 text-muted-foreground border rounded-xl bg-card">
        Không tìm thấy thông tin cửa hàng của bạn. Vui lòng liên hệ quản trị
        viên.
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1600px] w-full animate-fade-in pb-12">
      {/* Ảnh đại diện cá nhân — lưu độc lập, KHÔNG qua submit form shop */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm flex items-center gap-5">
        <div
          {...getAvatarProps()}
          className="relative h-24 w-24 rounded-full border-4 border-card bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center overflow-hidden cursor-pointer group shadow-md shrink-0"
        >
          <input {...getAvatarInputProps()} />
          <UserAvatar
            src={displayAvatar}
            name={authUser?.username}
            className="w-full h-full text-3xl"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
            {isUploadingAvatar ? (
              <Loader2 className="h-7 w-7 text-white animate-spin" />
            ) : (
              <Camera className="h-7 w-7 text-white" />
            )}
          </div>
        </div>
        <div>
          <h3 className="text-lg font-extrabold text-foreground">
            Ảnh đại diện cá nhân
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Ảnh gắn với tài khoản của bạn (khác logo cửa hàng). Bấm vào ảnh để
            đổi (tối đa 10MB).
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Header lồng cụm nút thao tác tĩnh hệ thống */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 pb-5 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
              Cài đặt Cửa hàng
            </h1>
            <p className="text-muted-foreground text-base mt-2">
              Cập nhật hồ sơ, thương hiệu (Logo, Banner, Ảnh bộ sưu tập) và
              thông tin vận hành của bạn.
            </p>
          </div>

          {/* Cụm nút bấm tĩnh đồng bộ góc phải Header */}
          <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving || isLoading}
              onClick={fetchShopData} // Khôi phục dữ liệu ban đầu
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-bold border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition duration-150"
            >
              Hủy thay đổi
            </Button>

            <Button
              type="submit"
              disabled={isSaving}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl font-extrabold shadow-md shadow-violet-500/10 transition duration-150"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang lưu...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> Lưu thông tin shop
                </>
              )}
            </Button>
          </div>
        </div>
        {/* Banner and Logo Section */}
        <div className="relative rounded-2xl border bg-card overflow-hidden shadow-sm">
          {/* Banner Dropzone */}
          <div
            {...getBannerProps()}
            className="h-60 md:h-80 bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center relative cursor-pointer group transition duration-200"
          >
            <input {...getBannerInputProps()} />
            {bannerPreviewUrl || shop.banner_url ? (
              <img
                src={bannerPreviewUrl || shop.banner_url || ''}
                alt="Shop Banner"
                className="w-full h-full object-cover transition group-hover:opacity-90"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <ImageIcon className="h-12 w-12 text-zinc-400" />
                <span className="text-sm font-semibold">
                  Tải lên ảnh Banner (Khuyên dùng: 3:1)
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition duration-200">
              <span className="bg-background/80 backdrop-blur-xs text-sm font-bold px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm text-foreground">
                <Camera className="h-4.5 w-4.5" /> Thay đổi Banner
              </span>
            </div>
          </div>

          {/* Avatar / Logo Container */}
          <div className="p-8 pt-20 relative flex flex-col md:flex-row md:items-end justify-between gap-5">
            {/* Round Logo Dropzone */}
            <div className="absolute -top-20 left-8 md:-top-24">
              <div
                {...getLogoProps()}
                className="h-36 w-36 md:h-44 md:w-44 rounded-full border-6 border-card bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center relative overflow-hidden cursor-pointer group shadow-md"
              >
                <input {...getLogoInputProps()} />
                {logoPreviewUrl || shop.logo_url ? (
                  <img
                    src={logoPreviewUrl || shop.logo_url || ''}
                    alt="Shop Logo"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Store className="h-16 w-16 text-zinc-400" />
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition duration-200">
                  <Camera className="h-8 w-8 text-white" />
                </div>
              </div>
            </div>

            {/* Shop Basic Meta */}
            <div className="md:pl-48">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl md:text-3xl font-black text-foreground">
                  {shop.name}
                </h2>
                {shop.status === 'active' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    <ShieldCheck className="h-4 w-4" /> Hoạt động
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 animate-pulse">
                    <ShieldAlert className="h-4 w-4" /> Chờ duyệt
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1.5 font-mono">
                Mã cửa hàng: {shop.id}
              </p>
            </div>
          </div>
        </div>

        {/* Form Fields Grid */}
        <div className="grid gap-8 md:grid-cols-5">
          {/* Text Settings (Left Column) */}
          <div className="md:col-span-3 space-y-6 rounded-2xl border bg-card p-8 shadow-sm">
            <h3 className="text-xl font-extrabold border-b pb-3 text-foreground">
              Thông tin cơ bản
            </h3>

            <Field>
              <FieldLabel
                htmlFor="shop-name"
                className="text-base font-bold flex items-center gap-2"
              >
                <Store className="h-5 w-5 text-violet-500" /> Tên gian hàng *
              </FieldLabel>
              <Input
                id="shop-name"
                placeholder="Nhập tên shop..."
                {...register('name')}
                className="py-3 text-base rounded-xl"
                aria-invalid={!!errors.name}
              />
              {errors.name && (
                <FieldError>{errors.name.message?.toString()}</FieldError>
              )}
            </Field>

            <Field>
              <FieldLabel
                htmlFor="pickup-address"
                className="text-base font-bold flex items-center gap-2"
              >
                <MapPin className="h-5 w-5 text-violet-500" /> Địa chỉ lấy hàng
                *
              </FieldLabel>
              <AddressAutocomplete
                value={watch('pickup_address')}
                onSelect={(coords) => {
                  setValue('pickup_address', coords.display_name, {
                    shouldValidate: true,
                  });
                  setSelectedCoords({ lat: coords.lat, lng: coords.lng });
                }}
                onQueryChange={() => setSelectedCoords(null)}
                placeholder="Ví dụ: 123 Đường ABC, Quận 1, TP.HCM"
                error={errors.pickup_address?.message?.toString()}
                disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground">
                Địa chỉ nhân viên giao vận tới lấy hàng khi có đơn.
              </p>
            </Field>

            {/* Thông tin ngân hàng */}
            <div className="space-y-5 pt-5 border-t border-zinc-100 dark:border-zinc-800">
              <h4 className="text-base font-extrabold text-foreground flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-violet-500" /> Thông tin
                ngân hàng rút tiền
              </h4>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="bank-name" className="text-sm font-bold">
                    Tên ngân hàng *
                  </FieldLabel>
                  <Input
                    id="bank-name"
                    placeholder="Ví dụ: Vietcombank, Techcombank..."
                    {...register('bank_name')}
                    className="py-3 text-base rounded-xl"
                    aria-invalid={!!errors.bank_name}
                  />
                  {errors.bank_name && (
                    <FieldError>
                      {errors.bank_name.message?.toString()}
                    </FieldError>
                  )}
                </Field>

                <Field>
                  <FieldLabel
                    htmlFor="account-number"
                    className="text-sm font-bold"
                  >
                    Số tài khoản *
                  </FieldLabel>
                  <Input
                    id="account-number"
                    placeholder="Ví dụ: 1903456789..."
                    {...register('account_number')}
                    className="py-3 text-base rounded-xl"
                    aria-invalid={!!errors.account_number}
                  />
                  {errors.account_number && (
                    <FieldError>
                      {errors.account_number.message?.toString()}
                    </FieldError>
                  )}
                </Field>
              </div>

              <Field>
                <FieldLabel
                  htmlFor="account-holder"
                  className="text-sm font-bold"
                >
                  Tên chủ tài khoản *
                </FieldLabel>
                <Input
                  id="account-holder"
                  placeholder="Ví dụ: NGUYEN VAN A"
                  {...register('account_holder')}
                  className="py-3 text-base rounded-xl"
                  aria-invalid={!!errors.account_holder}
                />
                {errors.account_holder && (
                  <FieldError>
                    {errors.account_holder.message?.toString()}
                  </FieldError>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Tên viết hoa không dấu. Sử dụng để đối soát và rút doanh thu
                  từ nền tảng.
                </p>
              </Field>
            </div>

            <Field>
              <FieldLabel
                htmlFor="shop-description"
                className="text-base font-bold flex items-center gap-2"
              >
                <Info className="h-5 w-5 text-violet-500" /> Mô tả cửa hàng
              </FieldLabel>
              <Textarea
                id="shop-description"
                placeholder="Mô tả các sản phẩm nổi bật hoặc chính sách của shop..."
                rows={6}
                {...register('description')}
                className="resize-none py-3.5 text-base rounded-xl"
                aria-invalid={!!errors.description}
              />
              {errors.description && (
                <FieldError>
                  {errors.description.message?.toString()}
                </FieldError>
              )}
            </Field>
          </div>

          {/* Gallery Media Section (Right Column) */}
          <div className="md:col-span-2 space-y-6 rounded-2xl border bg-card p-8 shadow-sm flex flex-col">
            <div className="border-b pb-3">
              <h3 className="text-xl font-extrabold text-foreground">
                Bộ sưu tập cửa hàng
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Hiển thị các hình ảnh chụp gian hàng, showroom hoặc chứng chỉ
                (Tối đa 3 ảnh).
              </p>
            </div>

            {/* Gallery Grid */}
            <div className="grid grid-cols-3 gap-3 py-2">
              {/* Existing Gallery Images */}
              {shop.gallery?.map((asset: any) => (
                <div
                  key={asset.id}
                  className="relative aspect-square rounded-xl overflow-hidden border group bg-zinc-100 dark:bg-zinc-900"
                >
                  <img
                    src={asset.url}
                    alt="Gallery item"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteExistingImage(asset.id)}
                    className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-rose-600/90 text-white opacity-0 group-hover:opacity-100 hover:bg-rose-700 transition duration-150 shadow-sm"
                    title="Xóa ảnh này"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              {/* Newly Selected Gallery Previews */}
              {newGalleryPreviews.map((preview, idx) => (
                <div
                  key={idx}
                  className="relative aspect-square rounded-xl overflow-hidden border group bg-violet-50 dark:bg-violet-950/20"
                >
                  <img
                    src={preview.url}
                    alt="New upload"
                    className="w-full h-full object-cover opacity-70"
                  />
                  <div className="absolute inset-0 bg-violet-600/10 flex items-center justify-center">
                    <span className="text-xs bg-violet-600 text-white font-bold px-1.5 py-0.5 rounded">
                      Mới
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveNewImage(idx)}
                    className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-zinc-800/90 text-white opacity-0 group-hover:opacity-100 hover:bg-zinc-900 transition duration-150 shadow-sm"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              {/* Upload Dropzone Slot if slots left */}
              {remainingGallerySlots > 0 && (
                <div
                  {...getGalleryProps()}
                  className="aspect-square rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex flex-col items-center justify-center text-center cursor-pointer hover:border-violet-500 hover:bg-violet-50/20 dark:hover:bg-violet-950/10 transition duration-200"
                >
                  <input {...getGalleryInputProps()} />
                  <Plus className="h-7 w-7 text-zinc-400" />
                  <span className="text-xs text-muted-foreground font-semibold mt-1">
                    Thêm ({remainingGallerySlots})
                  </span>
                </div>
              )}
            </div>

            <div className="text-sm text-muted-foreground bg-muted p-4 rounded-xl mt-auto space-y-1.5">
              <p className="font-bold flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                💡 Hướng dẫn upload:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Bấm vào khung ảnh tương ứng để chọn ảnh mới thay thế.</li>
                <li>
                  Hệ thống tự động lưu Logo và Banner mới khi bấm{' '}
                  <strong>"Lưu thay đổi"</strong>.
                </li>
                <li>
                  Các ảnh trong <strong>Bộ sưu tập</strong> mới cũng sẽ được tải
                  lên khi lưu.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
