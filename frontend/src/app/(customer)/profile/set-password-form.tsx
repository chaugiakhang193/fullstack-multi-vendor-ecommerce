'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import {
  SetPasswordBody,
  SetPasswordBodyType,
} from '@/schemaValidations/auth/auth.schema';
import authApiRequest from '@/apiRequests/auth/auth';
import { getErrorMessage } from '@/lib/http';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldLabel, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function SetPasswordForm({
  initialHasPassword,
}: {
  initialHasPassword: boolean;
}) {
  const [hasPassword, setHasPassword] = useState(initialHasPassword);
  const [isSaving, setIsSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SetPasswordBodyType>({
    resolver: zodResolver(SetPasswordBody),
    defaultValues: { new_password: '', confirmPassword: '' },
  });

  if (hasPassword) return null;

  async function onSubmit(data: SetPasswordBodyType) {
    try {
      setIsSaving(true);
      const res = await authApiRequest.setPassword({
        new_password: data.new_password,
      });
      toast.success('Tạo mật khẩu thành công', {
        description:
          res.message ||
          'Bạn đã có thể đăng nhập bằng email + mật khẩu bên cạnh Google.',
      });
      reset();
      setHasPassword(true); // ẩn form sau khi tạo
    } catch (error) {
      toast.error('Tạo mật khẩu thất bại', {
        description: getErrorMessage(error),
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Tạo mật khẩu</CardTitle>
        <CardDescription>
          Tài khoản của bạn đang đăng nhập bằng Google. Tạo mật khẩu để có thể
          đăng nhập bằng email + mật khẩu.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Field data-invalid={!!errors.new_password}>
            <FieldLabel htmlFor="new_password">Mật khẩu mới</FieldLabel>
            <Input
              id="new_password"
              type="password"
              disabled={isSaving}
              {...register('new_password')}
            />
            {errors.new_password && (
              <FieldError errors={[errors.new_password]} />
            )}
          </Field>

          <Field data-invalid={!!errors.confirmPassword}>
            <FieldLabel htmlFor="confirmPassword">Xác nhận mật khẩu</FieldLabel>
            <Input
              id="confirmPassword"
              type="password"
              disabled={isSaving}
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <FieldError errors={[errors.confirmPassword]} />
            )}
          </Field>

          <Button type="submit" disabled={isSaving} className="w-fit">
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Đang lưu...
              </>
            ) : (
              'Tạo mật khẩu'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
