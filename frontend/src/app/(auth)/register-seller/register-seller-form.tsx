"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import {
  RegisterBody,
  RegisterBodyType,
} from "@/schemaValidations/auth/auth.schema";
import authApiRequest from "@/apiRequests/auth/auth";
import { getErrorMessage } from "@/lib/http";
import { BROADCAST_CHANNELS, BROADCAST_EVENTS } from "@/constants/broadcast";
import { tabId } from "@/lib/utils";
//Store
import { useAuthStore } from "@/store/useAuthStore";

export function RegisterSellerForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  //Nếu đã login từ trước thì lấy thông tin ra và redirect người dùng
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const logoutStore = useAuthStore((state) => state.logout);

  //Nếu có accessToken trong RAM qua Zustand và là seller/admin thì redirect
  useEffect(() => {
    if (accessToken && user) {
      if (user.role === "seller") {
        router.push("/seller");
      } else if (user.role === "admin") {
        router.push("/admin");
      }
    }
  }, [accessToken, user, router]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await authApiRequest.logout();
    } catch (error) {
      console.error("Lỗi đăng xuất:", error);
    } finally {
      logoutStore();

      // Đồng bộ đăng xuất sang các tab khác
      if (typeof window !== "undefined") {
        try {
          const channel = new BroadcastChannel(BROADCAST_CHANNELS.AUTH);
          channel.postMessage({ type: BROADCAST_EVENTS.AUTH_LOGOUT_SUCCESS, senderTabId: tabId });
          channel.close();
        } catch (e) {
          console.error(e);
        }
      }

      toast.success("Đăng xuất thành công. Bây giờ bạn có thể đăng ký tài khoản Người bán!");
      setIsLoggingOut(false);
    }
  };

  //Khởi tạo Form
  const form = useForm<RegisterBodyType>({
    resolver: zodResolver(RegisterBody),
    mode: "onTouched",
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(data: RegisterBodyType) {
    try {
      setIsLoading(true);
      const { confirmPassword, ...dataToSend } = data;
      const res = await authApiRequest.registerSeller(dataToSend);
      toast.success("Tuyệt vời!", {
        description:
          res.message || "Bạn đã gửi yêu cầu đăng ký người bán thành công.",
      });
      router.push("/verify-email");
    } catch (error) {
      const errMsg = getErrorMessage(error);
      const failTitle = "Đăng ký thất bại";
      toast.error(failTitle, {
        description: errMsg,
      });
    } finally {
      setIsLoading(false);
    }
  }

  // Nếu đã đăng nhập dưới quyền Customer, hiển thị màn hình yêu cầu đăng xuất để tiếp tục
  if (accessToken && user?.role === "customer") {
    return (
      <div className={cn("flex flex-col gap-4 w-full", className)} {...props}>
        <Card className="flex flex-col w-full max-h-full shadow-lg max-w-2xl justify-center mx-auto p-6 sm:p-10 animate-fade-in relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-violet-500 to-indigo-500" />
          <CardHeader className="text-center pb-6 sm:pb-8">
            <CardTitle className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
              Bạn đang đăng nhập dưới quyền Khách hàng
            </CardTitle>
            <CardDescription className="text-base sm:text-lg mt-2">
              Tài khoản hiện tại của bạn là <b>{user.username}</b> (vai trò: Khách hàng).
              Đăng ký trở thành Người bán yêu cầu một tài khoản riêng biệt. Bạn cần đăng xuất tài khoản này trước khi tạo tài khoản Người bán mới.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
            <Button
              onClick={() => router.push("/")}
              variant="outline"
              className="flex-1 h-12 text-sm font-semibold rounded-xl"
              disabled={isLoggingOut}
            >
              Quay lại Trang chủ
            </Button>
            <Button
              onClick={handleLogout}
              className="flex-1 h-12 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-sm font-semibold rounded-xl"
              disabled={isLoggingOut}
            >
              {isLoggingOut ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang đăng xuất...
                </>
              ) : (
                "Đăng xuất & Đăng ký"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4 w-full", className)} {...props}>
      <Card className="flex flex-col w-full max-h-full shadow-lg max-w-2xl justify-center mx-auto p-6 sm:p-10">
        <CardHeader className="text-center pb-6 sm:pb-8">
          <CardTitle className="text-2xl sm:text-3xl font-bold">Đăng ký người bán</CardTitle>
          <CardDescription className="text-base sm:text-lg">
            Chào mừng bạn đến với <b>Giang Kha shop</b>!<br />
            Đăng ký để trở thành người bán hàng của chúng tôi nhé!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id="register-seller-form"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <FieldGroup className="gap-6">
              {/* 1. Field: Username */}
              <Controller
                name="username"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="gap-2">
                    <FieldLabel htmlFor="username" className="text-base sm:text-lg font-medium">
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
                    <FieldLabel htmlFor="email" className="text-base sm:text-lg font-medium">
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

              {/* 3. Field: Password */}
              <Controller
                name="password"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="gap-2">
                    <FieldLabel htmlFor="password" className="text-base sm:text-lg font-medium">
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

              {/* 4. Field: Confirm Password */}
              <Controller
                name="confirmPassword"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="gap-2">
                    <FieldLabel htmlFor="confirm-password" className="text-base sm:text-lg font-medium">
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

              <div className="pt-4">
                <Button type="submit" className="w-full h-12 text-base sm:text-lg font-semibold" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Đang đăng ký ...
                    </>
                  ) : (
                    "Đăng ký người bán"
                  )}
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

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
