"use client";

import React, { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Ticket,
  Plus,
  Edit2,
  Trash2,
  Search,
  Loader2,
  Calendar,
  DollarSign,
  Percent,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";

import {
  useAdminCoupons,
  useAdminCreateCoupon,
  useAdminUpdateCoupon,
  useAdminDeleteCoupon,
} from "@/hooks/useCoupons";
import {
  CreateCouponBody,
  CreateCouponBodyType,
  CouponTypeObj,
  UpdateCouponBodyType,
} from "@/schemaValidations/promotions/coupons.schema";
import { CouponType, DiscountType } from "@/constants/enum";
import { formatVnd } from "@/lib/format";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";

function formatDateTimeLocal(isoString: string | null | undefined): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "";
  const tzOffset = date.getTimezoneOffset() * 60000;
  const localISOTime = new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
  return localISOTime;
}

export default function AdminCouponsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState<CouponTypeObj | null>(null);

  // Fetch Coupons
  const { data: envelope, isLoading } = useAdminCoupons({ limit: 100 });
  const coupons = envelope?.data?.items ?? [];

  // Mutations
  const createMutation = useAdminCreateCoupon();
  const updateMutation = useAdminUpdateCoupon(selectedCoupon?.id ?? "");
  const deleteMutation = useAdminDeleteCoupon();

  // Forms
  const {
    register: registerCreate,
    handleSubmit: handleSubmitCreate,
    reset: resetCreate,
    setValue: setValueCreate,
    watch: watchCreate,
    formState: { errors: createErrors },
  } = useForm<CreateCouponBodyType>({
    resolver: zodResolver(CreateCouponBody) as any,
    defaultValues: {
      code: "",
      discount_type: DiscountType.FIXED_AMOUNT,
      discount_value: 0,
      min_order_value: 0,
      max_discount_value: undefined,
      start_date: "",
      end_date: "",
      usage_limit: undefined,
    },
  });

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    reset: resetEdit,
    setValue: setValueEdit,
    watch: watchEdit,
    formState: { errors: editErrors },
  } = useForm<CreateCouponBodyType>({
    resolver: zodResolver(CreateCouponBody) as any,
    defaultValues: {
      code: "",
      discount_type: DiscountType.FIXED_AMOUNT,
      discount_value: 0,
      min_order_value: 0,
      max_discount_value: undefined,
      start_date: "",
      end_date: "",
      usage_limit: undefined,
    },
  });

  const createDiscountType = watchCreate("discount_type");
  const editDiscountType = watchEdit("discount_type");

  // Statistics calculation
  const stats = useMemo(() => {
    const total = coupons.length;
    const now = new Date();
    let active = 0;
    let expired = 0;
    let scheduled = 0;
    let totalUsed = 0;

    coupons.forEach((c) => {
      totalUsed += c.used_count;
      const start = c.start_date ? new Date(c.start_date) : null;
      const end = c.end_date ? new Date(c.end_date) : null;

      if (end && now > end) {
        expired++;
      } else if (start && now < start) {
        scheduled++;
      } else {
        active++;
      }
    });

    return { total, active, expired, scheduled, totalUsed };
  }, [coupons]);

  // Filtered coupons list
  const filteredCoupons = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return coupons;
    return coupons.filter((c) => c.code.toLowerCase().includes(q));
  }, [coupons, searchQuery]);

  // Submit Handlers
  const onCreateSubmit = (data: CreateCouponBodyType) => {
    const payload = {
      ...data,
      start_date: new Date(data.start_date).toISOString(),
      end_date: new Date(data.end_date).toISOString(),
      max_discount_value: data.discount_type === DiscountType.PERCENTAGE ? (data.max_discount_value ?? undefined) : undefined,
    };
    createMutation.mutate(payload, {
      onSuccess: () => {
        resetCreate();
        setIsCreateOpen(false);
      },
    });
  };

  const onEditSubmit = (data: CreateCouponBodyType) => {
    const payload = {
      ...data,
      start_date: new Date(data.start_date).toISOString(),
      end_date: new Date(data.end_date).toISOString(),
      max_discount_value: data.discount_type === DiscountType.PERCENTAGE ? (data.max_discount_value ?? undefined) : undefined,
    };
    updateMutation.mutate(payload, {
      onSuccess: () => {
        setIsEditOpen(false);
        setSelectedCoupon(null);
      },
    });
  };

  const onDeleteConfirm = () => {
    if (!selectedCoupon) return;
    deleteMutation.mutate(selectedCoupon.id, {
      onSuccess: () => {
        setIsDeleteOpen(false);
        setSelectedCoupon(null);
      },
    });
  };

  const handleEditClick = (coupon: CouponTypeObj) => {
    setSelectedCoupon(coupon);
    setValueEdit("code", coupon.code);
    setValueEdit("discount_type", coupon.discount_type);
    setValueEdit("discount_value", coupon.discount_value);
    setValueEdit("min_order_value", coupon.min_order_value ?? 0);
    setValueEdit("max_discount_value", coupon.max_discount_value ?? undefined);
    setValueEdit("start_date", formatDateTimeLocal(coupon.start_date));
    setValueEdit("end_date", formatDateTimeLocal(coupon.end_date));
    setValueEdit("usage_limit", coupon.usage_limit ?? undefined);
    setIsEditOpen(true);
  };

  const handleDeleteClick = (coupon: CouponTypeObj) => {
    setSelectedCoupon(coupon);
    setIsDeleteOpen(true);
  };

  const getCouponStatusBadge = (start: string | null, end: string | null) => {
    if (!end) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Vô hạn</span>;
    const now = new Date();
    const endDate = new Date(end);
    const startDate = start ? new Date(start) : null;

    if (now > endDate) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/30 dark:text-rose-400">
          <XCircle className="h-3 w-3" /> Hết hạn
        </span>
      );
    }
    if (startDate && now < startDate) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400">
          <Clock className="h-3 w-3" /> Sắp diễn ra
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> Đang chạy
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Ticket className="h-6 w-6 text-violet-500" />
            Mã Giảm Giá Toàn Sàn (Admin)
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Tạo và quản lý các chiến dịch khuyến mãi toàn sàn cho tất cả khách hàng.
          </p>
        </div>
        <Button
          onClick={() => {
            resetCreate();
            setIsCreateOpen(true);
          }}
          className="bg-violet-600 hover:bg-violet-700 text-white font-bold gap-2 shrink-0 self-start md:self-auto"
        >
          <Plus className="h-4 w-4" /> Tạo mã toàn sàn
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-xs flex items-center space-x-3">
          <div className="p-2.5 bg-violet-100 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 rounded-lg">
            <Ticket className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase">Tổng số mã</p>
            <p className="text-xl font-bold">{stats.total}</p>
          </div>
        </div>
        <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-xs flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase">Đang chạy</p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{stats.active}</p>
          </div>
        </div>
        <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-xs flex items-center space-x-3">
          <div className="p-2.5 bg-rose-100 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-lg">
            <XCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase">Hết hạn</p>
            <p className="text-xl font-bold text-rose-600 dark:text-rose-400">{stats.expired}</p>
          </div>
        </div>
        <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-xs flex items-center space-x-3">
          <div className="p-2.5 bg-amber-100 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-lg">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase">Lượt đã dùng</p>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{stats.totalUsed}</p>
          </div>
        </div>
      </div>

      {/* Filter and Table */}
      <div className="border rounded-xl bg-card shadow-xs flex-1 flex flex-col min-h-[400px]">
        {/* Search */}
        <div className="p-4 border-b flex items-center">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm kiếm theo mã..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-x-auto">
          {isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-violet-600 animate-spin" />
            </div>
          ) : filteredCoupons.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-zinc-500 gap-2">
              <Ticket className="h-10 w-10 text-zinc-300 dark:text-zinc-700" />
              <p className="font-semibold text-sm">Không tìm thấy mã giảm giá nào</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                  <th className="p-4 w-32">Mã code</th>
                  <th className="p-4">Giá trị giảm</th>
                  <th className="p-4">Đơn tối thiểu</th>
                  <th className="p-4">Giảm tối đa</th>
                  <th className="p-4">Đã dùng / Giới hạn</th>
                  <th className="p-4">Thời gian</th>
                  <th className="p-4">Trạng thái</th>
                  <th className="p-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredCoupons.map((c) => {
                  const limitStr = c.usage_limit ? `${c.used_count}/${c.usage_limit}` : `${c.used_count}/∞`;
                  const isPct = c.discount_type === DiscountType.PERCENTAGE;
                  const discountStr = isPct ? `${c.discount_value}%` : formatVnd.format(c.discount_value);
                  const minOrderStr = formatVnd.format(c.min_order_value ?? 0);
                  const maxDiscountStr = isPct && c.max_discount_value ? formatVnd.format(c.max_discount_value) : "—";
                  const dateStr = `${new Date(c.start_date!).toLocaleDateString("vi-VN")} - ${new Date(c.end_date!).toLocaleDateString("vi-VN")}`;

                  return (
                    <tr key={c.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="p-4 font-mono font-bold text-violet-600 dark:text-violet-400">{c.code}</td>
                      <td className="p-4 font-semibold">{discountStr}</td>
                      <td className="p-4">{minOrderStr}</td>
                      <td className="p-4">{maxDiscountStr}</td>
                      <td className="p-4 font-medium">{limitStr}</td>
                      <td className="p-4 text-xs font-medium text-zinc-500">{dateStr}</td>
                      <td className="p-4">{getCouponStatusBadge(c.start_date, c.end_date)}</td>
                      <td className="p-4 text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditClick(c)}
                          className="h-8 w-8 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(c)}
                          className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* CREATE DIALOG */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl sm:text-2xl font-bold">Tạo Mã Giảm Giá Mới</DialogTitle>
            <DialogDescription className="text-sm sm:text-base">Nhập thông tin chi tiết của coupon toàn sàn.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitCreate(onCreateSubmit)} className="space-y-4">
            <Field>
              <FieldLabel htmlFor="create-code" className="text-sm sm:text-base font-semibold">Mã giảm giá (Code)</FieldLabel>
              <Input
                id="create-code"
                placeholder="Ví dụ: SANTOT50"
                className="uppercase h-10 sm:h-11 text-sm sm:text-base"
                {...registerCreate("code")}
              />
              <FieldError>{createErrors.code?.message}</FieldError>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel className="text-sm sm:text-base font-semibold">Loại giảm giá</FieldLabel>
                <select
                  className="w-full h-10 sm:h-11 rounded-md border border-input bg-background px-3 py-1 text-sm sm:text-base shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  {...registerCreate("discount_type")}
                >
                  <option value={DiscountType.FIXED_AMOUNT}>Giảm tiền mặt (đ)</option>
                  <option value={DiscountType.PERCENTAGE}>Giảm theo %</option>
                </select>
                <FieldError>{createErrors.discount_type?.message}</FieldError>
              </Field>

              <Field>
                <FieldLabel htmlFor="create-value" className="text-sm sm:text-base font-semibold">
                  {createDiscountType === DiscountType.PERCENTAGE ? "Phần trăm giảm (%)" : "Số tiền giảm (đ)"}
                </FieldLabel>
                <Input
                  id="create-value"
                  type="number"
                  placeholder={createDiscountType === DiscountType.PERCENTAGE ? "Ví dụ: 10" : "Ví dụ: 20000"}
                  className="h-10 sm:h-11 text-sm sm:text-base"
                  {...registerCreate("discount_value")}
                />
                <FieldError>{createErrors.discount_value?.message}</FieldError>
              </Field>
            </div>

            <div className={createDiscountType === DiscountType.PERCENTAGE ? "grid grid-cols-2 gap-4" : "grid grid-cols-1 gap-4"}>
              <Field>
                <FieldLabel htmlFor="create-min" className="text-sm sm:text-base font-semibold">Giá trị đơn tối thiểu (đ)</FieldLabel>
                <Input
                  id="create-min"
                  type="number"
                  placeholder="Ví dụ: 50000"
                  className="h-10 sm:h-11 text-sm sm:text-base"
                  {...registerCreate("min_order_value")}
                />
                <FieldError>{createErrors.min_order_value?.message}</FieldError>
              </Field>

              {createDiscountType === DiscountType.PERCENTAGE && (
                <Field>
                  <FieldLabel htmlFor="create-max" className="text-sm sm:text-base font-semibold">Giá trị giảm tối đa (đ)</FieldLabel>
                  <Input
                    id="create-max"
                    type="number"
                    placeholder="Bỏ trống nếu không giới hạn"
                    className="h-10 sm:h-11 text-sm sm:text-base"
                    {...registerCreate("max_discount_value")}
                  />
                  <FieldError>{createErrors.max_discount_value?.message}</FieldError>
                </Field>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="create-start" className="text-sm sm:text-base font-semibold">Ngày bắt đầu</FieldLabel>
                <Input
                  id="create-start"
                  type="datetime-local"
                  className="h-10 sm:h-11 text-sm sm:text-base"
                  {...registerCreate("start_date")}
                />
                <FieldError>{createErrors.start_date?.message}</FieldError>
              </Field>

              <Field>
                <FieldLabel htmlFor="create-end" className="text-sm sm:text-base font-semibold">Ngày kết thúc</FieldLabel>
                <Input
                  id="create-end"
                  type="datetime-local"
                  className="h-10 sm:h-11 text-sm sm:text-base"
                  {...registerCreate("end_date")}
                />
                <FieldError>{createErrors.end_date?.message}</FieldError>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="create-limit" className="text-sm sm:text-base font-semibold">Giới hạn lượt dùng toàn sàn</FieldLabel>
              <Input
                id="create-limit"
                type="number"
                placeholder="Bỏ trống nếu không giới hạn"
                className="h-10 sm:h-11 text-sm sm:text-base"
                {...registerCreate("usage_limit")}
              />
              <FieldError>{createErrors.usage_limit?.message}</FieldError>
            </Field>

            <DialogFooter className="pt-4 border-t gap-3">
              <DialogClose render={<Button variant="outline" type="button" size="lg" className="h-10 sm:h-11 text-sm sm:text-base px-5" />}>
                Hủy
              </DialogClose>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                size="lg"
                className="bg-violet-600 hover:bg-violet-700 text-white font-bold h-10 sm:h-11 text-sm sm:text-base px-6"
              >
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Tạo mã
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* EDIT DIALOG */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl sm:text-2xl font-bold">Cập Nhật Mã Giảm Giá</DialogTitle>
            <DialogDescription className="text-sm sm:text-base">Chỉnh sửa các thông tin của coupon đang chọn.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitEdit(onEditSubmit)} className="space-y-4">
            <Field>
              <FieldLabel htmlFor="edit-code" className="text-sm sm:text-base font-semibold">Mã giảm giá (Code)</FieldLabel>
              <Input
                id="edit-code"
                placeholder="Mã giảm giá"
                className="uppercase text-muted-foreground h-10 sm:h-11 text-sm sm:text-base"
                readOnly
                {...registerEdit("code")}
              />
              <FieldError>{editErrors.code?.message}</FieldError>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel className="text-sm sm:text-base font-semibold">Loại giảm giá</FieldLabel>
                <select
                  className="w-full h-10 sm:h-11 rounded-md border border-input bg-background px-3 py-1 text-sm sm:text-base shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  {...registerEdit("discount_type")}
                >
                  <option value={DiscountType.FIXED_AMOUNT}>Giảm tiền mặt (đ)</option>
                  <option value={DiscountType.PERCENTAGE}>Giảm theo %</option>
                </select>
                <FieldError>{editErrors.discount_type?.message}</FieldError>
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-value" className="text-sm sm:text-base font-semibold">
                  {editDiscountType === DiscountType.PERCENTAGE ? "Phần trăm giảm (%)" : "Số tiền giảm (đ)"}
                </FieldLabel>
                <Input
                  id="edit-value"
                  type="number"
                  placeholder="Ví dụ: 20000"
                  className="h-10 sm:h-11 text-sm sm:text-base"
                  {...registerEdit("discount_value")}
                />
                <FieldError>{editErrors.discount_value?.message}</FieldError>
              </Field>
            </div>

            <div className={editDiscountType === DiscountType.PERCENTAGE ? "grid grid-cols-2 gap-4" : "grid grid-cols-1 gap-4"}>
              <Field>
                <FieldLabel htmlFor="edit-min" className="text-sm sm:text-base font-semibold">Giá trị đơn tối thiểu (đ)</FieldLabel>
                <Input
                  id="edit-min"
                  type="number"
                  placeholder="Ví dụ: 50000"
                  className="h-10 sm:h-11 text-sm sm:text-base"
                  {...registerEdit("min_order_value")}
                />
                <FieldError>{editErrors.min_order_value?.message}</FieldError>
              </Field>

              {editDiscountType === DiscountType.PERCENTAGE && (
                <Field>
                  <FieldLabel htmlFor="edit-max" className="text-sm sm:text-base font-semibold">Giá trị giảm tối đa (đ)</FieldLabel>
                  <Input
                    id="edit-max"
                    type="number"
                    placeholder="Bỏ trống nếu không giới hạn"
                    className="h-10 sm:h-11 text-sm sm:text-base"
                    {...registerEdit("max_discount_value")}
                  />
                  <FieldError>{editErrors.max_discount_value?.message}</FieldError>
                </Field>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="edit-start" className="text-sm sm:text-base font-semibold">Ngày bắt đầu</FieldLabel>
                <Input
                  id="edit-start"
                  type="datetime-local"
                  className="h-10 sm:h-11 text-sm sm:text-base"
                  {...registerEdit("start_date")}
                />
                <FieldError>{editErrors.start_date?.message}</FieldError>
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-end" className="text-sm sm:text-base font-semibold">Ngày kết thúc</FieldLabel>
                <Input
                  id="edit-end"
                  type="datetime-local"
                  className="h-10 sm:h-11 text-sm sm:text-base"
                  {...registerEdit("end_date")}
                />
                <FieldError>{editErrors.end_date?.message}</FieldError>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="edit-limit" className="text-sm sm:text-base font-semibold">Giới hạn lượt dùng toàn sàn</FieldLabel>
              <Input
                id="edit-limit"
                type="number"
                placeholder="Bỏ trống nếu không giới hạn"
                className="h-10 sm:h-11 text-sm sm:text-base"
                {...registerEdit("usage_limit")}
              />
              <FieldError>{editErrors.usage_limit?.message}</FieldError>
            </Field>

            <DialogFooter className="pt-4 border-t gap-3">
              <DialogClose render={<Button variant="outline" type="button" size="lg" className="h-10 sm:h-11 text-sm sm:text-base px-5" />}>
                Hủy
              </DialogClose>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                size="lg"
                className="bg-violet-600 hover:bg-violet-700 text-white font-bold h-10 sm:h-11 text-sm sm:text-base px-6"
              >
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Lưu thay đổi
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DELETE DIALOG */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
              Xác nhận xóa
            </DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa mã giảm giá <span className="font-mono font-bold text-zinc-950 dark:text-zinc-50">{selectedCoupon?.code}</span>?
              Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-4 gap-2">
            <DialogClose render={<Button variant="outline" />}>
              Hủy
            </DialogClose>
            <Button
              variant="destructive"
              onClick={onDeleteConfirm}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xác nhận xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
