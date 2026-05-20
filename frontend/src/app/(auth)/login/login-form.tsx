"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
//API fetch heplers
import authApiRequest from "@/apiRequests/auth";
//Store
import { useAuthStore } from "@/store/useAuthStore";
import { tabId } from "@/lib/utils";

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
import { LoginBody, LoginBodyType } from "@/schemaValidations/auth.schema";

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
      if (currentUser?.role === "admin") return "/admin";
      if (currentUser?.role === "seller") return "/seller";
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
      console.log(res);
      setAuth(UserInfo, access_token);
      toast.success("Đăng nhập thành công!", {
        description: res.message || "Chào mừng bạn quay trở lại.",
      });

      //Khi đăng nhập xong tạo một message để báo cho các tab khác
      const channel = new BroadcastChannel("auth-channel");
      channel.postMessage({ type: "login_success", senderTabId: tabId });
      channel.close();

      router.push(getRedirectUrl(UserInfo));
    } catch (error) {
      const httpError = error as { payload?: { message?: string } };

      toast.error("Đăng nhập thất bại", {
        description:
          httpError.payload?.message ||
          "Thông tin không hợp lệ. Vui lòng thử lại.",
      });

      if (httpError.payload?.message?.includes("chưa được xác thực")) {
        router.push("/verify-email");
      }
      setIsLoading(false);
    }
  }

  // 3. Render giao diện bạn yêu cầu, đã được bọc Controller
  return (
    <div className={cn("flex flex-col gap-4 w-full", className)} {...props}>
      <Card className="flex flex-col w-full max-h-full  shadow-lg max-w-lg justify-center mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Đăng nhập</CardTitle>
        </CardHeader>
        <CardContent>
          <form id="login-form" onSubmit={form.handleSubmit(onSubmit)}>
            {/* CẤP ĐỘ 1: Dùng space-y-4 để cả 4 hàng cách đều nhau 1 khoảng 16px */}
            <FieldGroup>
              {/* 1. Field: Username */}
              <Controller
                name="username"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="username" className="text-sm">
                      Email hoặc Tên đăng nhập
                    </FieldLabel>
                    <Input
                      {...field}
                      id="username"
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
                  <Field data-invalid={fieldState.invalid}>
                    <div className="flex items-center justify-between">
                      <FieldLabel htmlFor="password" className="text-sm">
                        Mật khẩu
                      </FieldLabel>
                      <a
                        href="/forgot-password"
                        className="text-sm text-primary hover:underline"
                      >
                        Quên mật khẩu?
                      </a>
                    </div>
                    <Input
                      {...field}
                      id="password"
                      type="password"
                      disabled={isLoading}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <div className="flex flex-col gap-2 pt-2">
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Đang đănh nhập...
                    </>
                  ) : (
                    "Đăng nhập"
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
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
