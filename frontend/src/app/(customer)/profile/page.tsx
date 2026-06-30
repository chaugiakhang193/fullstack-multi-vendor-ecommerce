'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import {
  Camera,
  Loader2,
  Save,
  User as UserIcon,
  Mail,
  Phone,
} from 'lucide-react';

import { useAuthStore } from '@/store/useAuthStore';
import userApiRequest from '@/apiRequests/users/users';
import {
  UpdateProfileBody,
  UpdateProfileBodyType,
} from '@/schemaValidations/users/profile.schema';
import { getErrorMessage } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/shared/user-avatar';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel, FieldError } from '@/components/ui/field';
import { SetPasswordForm } from '@/app/(customer)/profile/set-password-form';

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  // null = đang tải; true = đã có mật khẩu; false = chưa có
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);

  const avatarPreview = useMemo(
    () => (avatarFile ? URL.createObjectURL(avatarFile) : null),
    [avatarFile],
  );
  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateProfileBodyType>({
    resolver: zodResolver(UpdateProfileBody),
    defaultValues: { full_name: '', phone: '' },
  });

  // Lấy dữ liệu mới nhất từ server, đồng bộ store + form
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await userApiRequest.getMe();
        if (!active) return;
        setUser(res.data);
        setHasPassword(Boolean(res.data.has_password));
        reset({
          full_name: res.data.full_name ?? '',
          phone: res.data.phone ?? '',
        });
      } catch (error: any) {
        toast.error(getErrorMessage(error));
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { getRootProps, getInputProps } = useDropzone({
    accept: { 'image/*': [] },
    multiple: false,
    maxSize: 10 * 1024 * 1024,
    onDrop: (accepted) => {
      if (accepted?.[0]) {
        setAvatarFile(accepted[0]);
        handleUploadAvatar(accepted[0]);
      }
    },
    onDropRejected: (rejections) => {
      rejections.forEach((r) =>
        r.errors.forEach((err) => {
          if (err.code === 'file-too-large') {
            toast.error('Ảnh vượt quá 10MB. Vui lòng chọn ảnh nhỏ hơn.');
          } else if (err.code === 'file-invalid-type') {
            toast.error('File không đúng định dạng. Chỉ chấp nhận ảnh.');
          } else {
            toast.error(`Lỗi tải file: ${err.message}`);
          }
        }),
      );
    },
  });

  const handleUploadAvatar = async (file: File) => {
    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await userApiRequest.uploadAvatar(formData);
      setUser(res.data);
      toast.success('Cập nhật ảnh đại diện thành công!');
    } catch (error: any) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsUploadingAvatar(false);
      setAvatarFile(null);
    }
  };

  const onSubmit = async (data: UpdateProfileBodyType) => {
    setIsSaving(true);
    try {
      const res = await userApiRequest.updateProfile({
        full_name: data.full_name?.trim() || '',
        phone: data.phone?.trim() || '',
      });
      setUser(res.data);
      toast.success('Cập nhật hồ sơ thành công!');
    } catch (error: any) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const displayAvatar = avatarPreview || user?.avatar_url || null;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="border-b pb-5">
        <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
          Hồ sơ của tôi
        </h1>
        <p className="text-muted-foreground mt-2">
          Quản lý ảnh đại diện và thông tin cá nhân của bạn.
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-8 shadow-sm flex flex-col sm:flex-row items-center gap-6">
        {/* Avatar dropzone */}
        <div
          {...getRootProps()}
          className="relative h-32 w-32 rounded-full border-4 border-card bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center overflow-hidden cursor-pointer group shadow-md shrink-0"
        >
          <input {...getInputProps()} />
          <UserAvatar
            src={displayAvatar}
            name={user?.username}
            className="w-full h-full text-4xl"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
            {isUploadingAvatar ? (
              <Loader2 className="h-8 w-8 text-white animate-spin" />
            ) : (
              <Camera className="h-8 w-8 text-white" />
            )}
          </div>
        </div>

        <div className="text-center sm:text-left">
          <h2 className="text-xl font-extrabold text-foreground">
            {user?.full_name || user?.username}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Bấm vào ảnh để thay đổi (tối đa 10MB).
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="rounded-2xl border bg-card p-8 shadow-sm space-y-6"
      >
        <h3 className="text-lg font-extrabold border-b pb-3 text-foreground">
          Thông tin cá nhân
        </h3>

        {/* Read-only: username + email */}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel className="text-sm font-bold flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-violet-500" /> Tên đăng nhập
            </FieldLabel>
            <Input
              value={user?.username ?? ''}
              disabled
              className="py-3 rounded-xl"
            />
          </Field>
          <Field>
            <FieldLabel className="text-sm font-bold flex items-center gap-2">
              <Mail className="h-4 w-4 text-violet-500" /> Email
            </FieldLabel>
            <Input
              value={user?.email ?? ''}
              disabled
              className="py-3 rounded-xl"
            />
          </Field>
        </div>

        {/* Editable: full_name + phone */}
        <Field>
          <FieldLabel htmlFor="full_name" className="text-sm font-bold">
            Họ và tên
          </FieldLabel>
          <Input
            id="full_name"
            placeholder="Ví dụ: Nguyễn Văn A"
            {...register('full_name')}
            className="py-3 rounded-xl"
            aria-invalid={!!errors.full_name}
          />
          {errors.full_name && (
            <FieldError>{errors.full_name.message?.toString()}</FieldError>
          )}
        </Field>

        <Field>
          <FieldLabel
            htmlFor="phone"
            className="text-sm font-bold flex items-center gap-2"
          >
            <Phone className="h-4 w-4 text-violet-500" /> Số điện thoại
          </FieldLabel>
          <Input
            id="phone"
            placeholder="Ví dụ: 0901234567"
            {...register('phone')}
            className="py-3 rounded-xl"
            aria-invalid={!!errors.phone}
          />
          {errors.phone && (
            <FieldError>{errors.phone.message?.toString()}</FieldError>
          )}
        </Field>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl font-extrabold shadow-md transition"
          >
            {isSaving ? (
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
      {hasPassword !== null && (
        <SetPasswordForm initialHasPassword={hasPassword} />
      )}
    </div>
  );
}
