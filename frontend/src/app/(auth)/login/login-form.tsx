'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
//API fetch heplers
import authApiRequest from '@/apiRequests/auth/auth';
import { getErrorMessage } from '@/lib/http';
//Store
import { useAuthStore } from '@/store/useAuthStore';
import { tabId } from '@/lib/utils';
import { UserRole } from '@/constants/enum';
import { BROADCAST_CHANNELS, BROADCAST_EVENTS } from '@/constants/broadcast';

//Components
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
import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { LoginBody, LoginBodyType } from '@/schemaValidations/auth/auth.schema';

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');

  // Đọc và hiển thị lỗi OAuth nếu BE redirect về login?error=...
  const oauthError = searchParams.get('error');
  const oauthErrorShown = useRef(false);
  useEffect(() => {
    if (!oauthError || oauthErrorShown.current) return;
    oauthErrorShown.current = true;
    const messages: Record<string, string> = {
      account_locked: 'Tài khoản của bạn đã bị khóa hoặc chưa được duyệt.',
      oauth_state: 'Phiên đăng nhập Google không hợp lệ. Vui lòng thử lại.',
      oauth: 'Đăng nhập Google thất bại. Vui lòng thử lại.',
    };
    toast.error('Đăng nhập Google thất bại', {
      description: messages[oauthError] ?? messages.oauth,
    });
  }, [oauthError]);

  const googleAuthUrl = `${process.env.NEXT_PUBLIC_API_URL}/auth/google`;

  //Nếu đã login từ trước thì lấy thông tin ra và redirect người dùng
  const { accessToken, user } = useAuthStore();

  const getRedirectUrl = React.useCallback(
    (currentUser: typeof user) => {
      if (redirect) return redirect;
      if (currentUser?.role === UserRole.ADMIN) return '/admin';
      if (currentUser?.role === UserRole.SELLER) return '/seller';
      return '/';
    },
    [redirect],
  );

  //Nếu có accessToken trong RAM qua Zustand thì redirect
  useEffect(() => {
    if (accessToken && user) {
      router.push(getRedirectUrl(user));
    }
  }, [accessToken, user, router, getRedirectUrl]);

  //Form được khởi tạo
  const form = useForm<LoginBodyType>({
    resolver: zodResolver(LoginBody),
    mode: 'onTouched',
    defaultValues: {
      username: '',
      password: '',
    },
  });

  async function onSubmit(data: LoginBodyType) {
    try {
      const dataToSend = data;
      setIsLoading(true);
      const res = await authApiRequest.login(dataToSend);
      const UserInfo = res.data.user;
      const access_token = res.data.access_token;
      setAuth(UserInfo, access_token);
      toast.success('Đăng nhập thành công!', {
        description: res.message || 'Chào mừng bạn quay trở lại.',
      });

      //Khi đăng nhập xong tạo một message để báo cho các tab khác
      const channel = new BroadcastChannel(BROADCAST_CHANNELS.AUTH);
      channel.postMessage({
        type: BROADCAST_EVENTS.AUTH_LOGIN_SUCCESS,
        senderTabId: tabId,
      });
      channel.close();

      router.push(getRedirectUrl(UserInfo));
    } catch (error) {
      const errMsg = getErrorMessage(error);
      const failTitle = 'Đăng nhập thất bại';
      toast.error(failTitle, {
        description: errMsg,
      });

      if (errMsg.includes('chưa được xác thực')) {
        const verifyEmailUrl = '/verify-email';
        router.push(verifyEmailUrl);
      }
      setIsLoading(false);
    }
  }

  // 3. Render giao diện bạn yêu cầu, đã được bọc Controller
  return (
    <div className={cn('flex flex-col gap-4 w-full', className)} {...props}>
      <Card className="flex flex-col w-full max-h-full shadow-lg max-w-2xl justify-center mx-auto p-6 sm:p-10">
        <CardHeader className="text-center pb-6 sm:pb-8">
          <CardTitle className="text-2xl sm:text-3xl font-bold">
            Đăng nhập
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form id="login-form" onSubmit={form.handleSubmit(onSubmit)}>
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
                      Email hoặc Tên đăng nhập
                    </FieldLabel>
                    <Input
                      {...field}
                      id="username"
                      className="h-12 px-4 text-base sm:text-lg md:text-lg placeholder:text-base sm:placeholder:text-lg md:placeholder:text-lg"
                      placeholder="Nhập email hoặc tên đăng nhập"
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
                    <div className="flex items-center justify-between">
                      <FieldLabel
                        htmlFor="password"
                        className="text-base sm:text-lg font-medium"
                      >
                        Mật khẩu
                      </FieldLabel>
                      <a
                        href="/forgot-password"
                        className="text-sm sm:text-base text-primary hover:underline"
                      >
                        Quên mật khẩu?
                      </a>
                    </div>
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
              <div className="flex flex-col gap-3 pt-4">
                <Button
                  type="submit"
                  className="w-full h-12 text-base sm:text-lg font-semibold"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Đang đăng nhập...
                    </>
                  ) : (
                    'Đăng nhập'
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-12 text-base sm:text-lg font-semibold"
                  disabled={isLoading}
                  onClick={() => router.push('/register')}
                >
                  Tạo tài khoản
                </Button>

                <div className="relative my-1 flex items-center">
                  <span className="flex-grow border-t" />
                  <span className="mx-3 text-sm text-muted-foreground">
                    Hoặc
                  </span>
                  <span className="flex-grow border-t" />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-12 text-base sm:text-lg font-semibold gap-2"
                  disabled={isLoading}
                  onClick={() => {
                    window.location.href = googleAuthUrl;
                  }}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
                    />
                  </svg>
                  Đăng nhập với Google
                </Button>
              </div>
              {/* Phần mô tả mật khẩu và Nút Submit */}
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
