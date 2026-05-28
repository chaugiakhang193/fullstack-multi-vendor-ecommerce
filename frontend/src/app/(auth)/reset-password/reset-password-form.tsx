"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import authApiRequest from "@/apiRequests/auth";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  ResetPasswordBody,
  ResetPasswordBodyType,
} from "@/schemaValidations/auth.schema";

export function ResetPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      toast.error("Không tìm thấy token hợp lệ.");
      router.push("/forgot-password");
    }
  }, [token, router]);

  const form = useForm<ResetPasswordBodyType>({
    resolver: zodResolver(ResetPasswordBody),
    mode: "onTouched",
    defaultValues: {
      token: token || "",
      new_password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(data: ResetPasswordBodyType) {
    try {
      setIsLoading(true);
      const { confirmPassword, ...dataToSend } = data; // Omit confirmPassword
      const res = await authApiRequest.resetPassword(dataToSend);

      toast.success("Thành công", {
        description:
          res.message ||
          "Đã đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.",
      });
      router.push("/login");
    } catch (error) {
      const httpError = error as { payload?: { message?: string } };
      toast.error("Thất bại", {
        description:
          httpError.payload?.message || "Có lỗi xảy ra khi đặt lại mật khẩu.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  if (!token) {
    return null; // Don't render form if token is missing, let useEffect redirect
  }

  return (
    <div className={cn("flex flex-col gap-4 w-full", className)} {...props}>
      <Card className="flex flex-col w-full max-h-full shadow-lg max-w-2xl justify-center mx-auto p-6 sm:p-10">
        <CardHeader className="text-center pb-6 sm:pb-8">
          <CardTitle className="text-2xl sm:text-3xl font-bold">Đặt lại mật khẩu mới</CardTitle>
          <CardDescription className="text-base sm:text-lg">
            Vui lòng nhập mật khẩu mới của bạn bên dưới.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="reset-password-form" onSubmit={form.handleSubmit(onSubmit)}>
            <FieldGroup className="gap-6">
              <Controller
                name="new_password"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="gap-2">
                    <FieldLabel htmlFor="new_password" className="text-base sm:text-lg font-medium">
                      Mật khẩu mới
                    </FieldLabel>
                    <Input
                      {...field}
                      id="new_password"
                      type="password"
                      className="h-12 px-4 text-base sm:text-lg md:text-lg placeholder:text-base sm:placeholder:text-lg md:placeholder:text-lg"
                      placeholder="Nhập mật khẩu mới"
                      disabled={isLoading}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              <Controller
                name="confirmPassword"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="gap-2">
                    <FieldLabel htmlFor="confirmPassword" className="text-base sm:text-lg font-medium">
                      Xác nhận mật khẩu
                    </FieldLabel>
                    <Input
                      {...field}
                      id="confirmPassword"
                      type="password"
                      className="h-12 px-4 text-base sm:text-lg md:text-lg placeholder:text-base sm:placeholder:text-lg md:placeholder:text-lg"
                      placeholder="Xác nhận lại mật khẩu mới"
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
                      Đang xử lý...
                    </>
                  ) : (
                    "Đặt lại mật khẩu"
                  )}
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
