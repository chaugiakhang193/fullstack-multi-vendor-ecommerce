'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  RegisterBody,
  RegisterBodyType,
} from '@/schemaValidations/auth/auth.schema';
import authApiRequest from '@/apiRequests/auth/auth';
import { getErrorMessage } from '@/lib/http';
//Store
import { useAuthStore } from '@/store/useAuthStore';
import {
  TurnstileWidget,
  CAPTCHA_ENABLED,
  type TurnstileWidgetHandle,
} from '@/components/shared/turnstile-widget';

export function RegisterForm({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Nút chỉ khoá TRƯỚC lần verify đầu tiên. Sau đó luôn mở — token được refresh
  // ngầm cho mỗi lần submit nên không khoá lại theo token (khỏi nháy/kẹt disabled).
  const [captchaVerifiedOnce, setCaptchaVerifiedOnce] = useState(false);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  //Nếu đã login từ trước thì lấy thông tin ra và redirect người dùng
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  //Nếu có accessToken trong RAM qua Zustand thì redirect
  useEffect(() => {
    if (accessToken) {
      const redirectUrl =
        user?.role === 'seller'
          ? '/seller'
          : user?.role === 'admin'
            ? '/admin'
            : '/';
      router.push(redirectUrl);
    }
  }, [accessToken, user, router]);

  //Khởi tạo Form
  const form = useForm<RegisterBodyType>({
    resolver: zodResolver(RegisterBody),
    mode: 'onTouched',
    defaultValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const handleCaptchaVerify = React.useCallback((token: string) => {
    setCaptchaToken(token);
    setCaptchaVerifiedOnce(true);
  }, []);

  // Token Turnstile hết hạn sau ~300s → hủy token cũ và lấy token mới ngầm; nút
  // vẫn mở nhờ captchaVerifiedOnce.
  const handleCaptchaExpire = React.useCallback(() => {
    setCaptchaToken(null);
    turnstileRef.current?.reset();
  }, []);

  async function onSubmit(data: RegisterBodyType) {
    if (CAPTCHA_ENABLED && !captchaToken) {
      toast.error('Vui lòng hoàn tất xác thực CAPTCHA.');
      return;
    }
    try {
      setIsLoading(true);
      const { confirmPassword, ...dataToSend } = data;
      const res = await authApiRequest.register(
        dataToSend,
        captchaToken ?? undefined,
      );
      toast.success('Tuyệt vời!', {
        description: res.message || 'Bạn đã tạo tài khoản thành công.',
      });
      router.push('/verify-email');
    } catch (error) {
      setCaptchaToken(null);
      // Token vừa bị BE tiêu thụ ở lần submit lỗi này (dùng một lần) → lấy token
      // mới ngầm. captchaVerifiedOnce vẫn true nên nút KHÔNG khoá lại.
      turnstileRef.current?.reset();
      const errMsg = getErrorMessage(error);
      const failTitle = 'Đăng ký thất bại';
      toast.error(failTitle, {
        description: errMsg,
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={cn('flex flex-col gap-4 w-full', className)} {...props}>
      <Card className="flex flex-col w-full max-h-full shadow-lg max-w-2xl justify-center mx-auto p-6 sm:p-10">
        <CardHeader className="text-center pb-6 sm:pb-8">
          <CardTitle className="text-2xl sm:text-3xl font-bold">
            Tạo tài khoản
          </CardTitle>
          <CardDescription className="text-base sm:text-lg">
            Chào mừng bạn đến với <b>Giang Kha</b>!<br />
            Hãy tạo tài khoản để tiếp tục nhé!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="register-form" onSubmit={form.handleSubmit(onSubmit)}>
            <FieldGroup className="gap-6">
              {/* 1. Field: Username */}
              <Controller
                name="username"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="gap-2">
                    <FieldLabel
                      htmlFor="username"
                      className="text-base sm:text-lg font-medium"
                    >
                      Tên đăng nhập
                    </FieldLabel>
                    <Input
                      {...field}
                      id="username"
                      className="h-12 px-4 text-base sm:text-lg md:text-lg placeholder:text-base sm:placeholder:text-lg md:placeholder:text-lg"
                      placeholder="Nhập tên đăng nhập"
                      disabled={isLoading}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              {/* 2. Field: Email */}
              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="gap-2">
                    <FieldLabel
                      htmlFor="email"
                      className="text-base sm:text-lg font-medium"
                    >
                      Email
                    </FieldLabel>
                    <Input
                      {...field}
                      id="email"
                      type="email"
                      className="h-12 px-4 text-base sm:text-lg md:text-lg placeholder:text-base sm:placeholder:text-lg md:placeholder:text-lg"
                      placeholder="m@example.com"
                      disabled={isLoading}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              {/* 3. Field: Password (Đã tách riêng) */}
              <Controller
                name="password"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="gap-2">
                    <FieldLabel
                      htmlFor="password"
                      className="text-base sm:text-lg font-medium"
                    >
                      Mật khẩu
                    </FieldLabel>
                    <Input
                      {...field}
                      id="password"
                      type="password"
                      className="h-12 px-4 text-base sm:text-lg md:text-lg placeholder:text-base sm:placeholder:text-lg md:placeholder:text-lg"
                      disabled={isLoading}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              {/* 4. Field: Confirm Password (Đã tách riêng) */}
              <Controller
                name="confirmPassword"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="gap-2">
                    <FieldLabel
                      htmlFor="confirm-password"
                      className="text-base sm:text-lg font-medium"
                    >
                      Xác nhận mật khẩu
                    </FieldLabel>
                    <Input
                      {...field}
                      id="confirm-password"
                      type="password"
                      className="h-12 px-4 text-base sm:text-lg md:text-lg placeholder:text-base sm:placeholder:text-lg md:placeholder:text-lg"
                      disabled={isLoading}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              {/* Phần mô tả mật khẩu và Nút Submit */}
              <TurnstileWidget
                ref={turnstileRef}
                onVerify={handleCaptchaVerify}
                onExpire={handleCaptchaExpire}
              />
              <div className="pt-4">
                <Button
                  type="submit"
                  className="w-full h-12 text-base sm:text-lg font-semibold"
                  disabled={
                    isLoading || (CAPTCHA_ENABLED && !captchaVerifiedOnce)
                  }
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Đang đăng ký ...
                    </>
                  ) : (
                    'Tạo tài khoản'
                  )}
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {/* Footer Text */}
      <FieldDescription className="px-6 text-center">
        <a href="#" className="underline">
          Điều khoản dịch vụ
        </a>{' '}
        và{' '}
        <a href="#" className="underline">
          Chính sách bảo mật
        </a>
        .
      </FieldDescription>
    </div>
  );
}
