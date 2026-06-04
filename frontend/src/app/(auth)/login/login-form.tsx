"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
//API fetch heplers
import authApiRequest from "@/apiRequests/auth/auth";
import { getErrorMessage } from "@/lib/http";
//Store
import { useAuthStore } from "@/store/useAuthStore";
import { tabId } from "@/lib/utils";
import { UserRole } from "@/constants/enum";
import { BROADCAST_CHANNEL, AUTH_EVENTS } from "@/constants/auth";

//Components
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { LoginBody, LoginBodyType } from "@/schemaValidations/auth/auth.schema";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");

  //Nếu đã login từ trước thì lấy thông tin ra và redirect người dùng
  const { accessToken, user } = useAuthStore();

  const getRedirectUrl = React.useCallback(
    (currentUser: typeof user) => {
      if (redirect) return redirect;
      if (currentUser?.role === UserRole.ADMIN) return "/admin";
      if (currentUser?.role === UserRole.SELLER) return "/seller";
      return "/";
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
    mode: "onTouched",
    defaultValues: {
      username: "",
      password: "",
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
      toast.success("Đăng nhập thành công!", {
        description: res.message || "Chào mừng bạn quay trở lại.",
      });

      //Khi đăng nhập xong tạo một message để báo cho các tab khác
      const channel = new BroadcastChannel(BROADCAST_CHANNEL.AUTH);
      channel.postMessage({ type: AUTH_EVENTS.LOGIN_SUCCESS, senderTabId: tabId });
      channel.close();

      router.push(getRedirectUrl(UserInfo));
    } catch (error) {
      const errMsg = getErrorMessage(error);
      const failTitle = "Đăng nhập thất bại";
      toast.error(failTitle, {
        description: errMsg,
      });

      if (errMsg.includes("chưa được xác thực")) {
        const verifyEmailUrl = "/verify-email";
        router.push(verifyEmailUrl);
      }
      setIsLoading(false);
    }
  }

  // 3. Render giao diện bạn yêu cầu, đã được bọc Controller
  return (
    <div className={cn("flex flex-col gap-4 w-full", className)} {...props}>
      <Card className="flex flex-col w-full max-h-full shadow-lg max-w-2xl justify-center mx-auto p-6 sm:p-10">
        <CardHeader className="text-center pb-6 sm:pb-8">
          <CardTitle className="text-2xl sm:text-3xl font-bold">Đăng nhập</CardTitle>
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
                    <FieldLabel htmlFor="username" className="text-base sm:text-lg font-medium">
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
                      <FieldLabel htmlFor="password" className="text-base sm:text-lg font-medium">
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
                <Button type="submit" className="w-full h-12 text-base sm:text-lg font-semibold" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Đang đăng nhập...
                    </>
                  ) : (
                    "Đăng nhập"
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-12 text-base sm:text-lg font-semibold"
                  disabled={isLoading}
                  onClick={() => router.push("/register")}
                >
                  Tạo tài khoản
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
        </a>{" "}
        và{" "}
        <a href="#" className="underline">
          Chính sách bảo mật
        </a>
        .
      </FieldDescription>
    </div>
  );
}
