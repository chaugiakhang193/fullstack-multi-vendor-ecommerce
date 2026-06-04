"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Eye,
  Store,
  MapPin,
  CreditCard,
  Tag,
  Loader2,
  Calendar,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import adminApiRequest from "@/apiRequests/shops/admin-shops";
import { RejectShopBody, ShopType } from "@/schemaValidations/shops/shops.schema";
import { Badge } from "@/components/ui/badge";
import { getErrorMessage } from "@/lib/http";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function AdminSellersPage() {
  const [shops, setShops] = useState<ShopType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [selectedShop, setSelectedShop] = useState<ShopType | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  const [isApproveOpen, setIsApproveOpen] = useState<boolean>(false);
  const [isRejectOpen, setIsRejectOpen] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  const fetchPendingShops = async () => {
    setLoading(true);
    try {
      const response = await adminApiRequest.getPendingShops();
      setShops(response.data || []);
    } catch (error: any) {
      console.error("Lỗi khi tải danh sách cửa hàng:", error);
      const errMsg = getErrorMessage(error);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingShops();
  }, []);

  const handleApprove = async () => {
    if (!selectedShop) return;
    setActionLoading(true);
    try {
      const response = await adminApiRequest.approveShop(selectedShop.id);
      toast.success(
        response.message ||
          `Đã phê duyệt hoạt động cho cửa hàng "${selectedShop.name}"`,
      );
      setShops((prev) => prev.filter((shop) => shop.id !== selectedShop.id));
      setIsApproveOpen(false);
      setIsDetailOpen(false);
    } catch (error: any) {
      console.error("Lỗi phê duyệt cửa hàng:", error);
      const errMsg = getErrorMessage(error);
      toast.error(errMsg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedShop) return;

    const validation = RejectShopBody.safeParse({
      reason: rejectReason.trim(),
    });
    if (!validation.success) {
      setRejectError(validation.error.errors[0].message);
      return;
    }

    setActionLoading(true);
    try {
      const response = await adminApiRequest.rejectShop(selectedShop.id, {
        reason: rejectReason.trim(),
      });
      toast.success(
        response.message ||
          `Đã từ chối đơn đăng ký của cửa hàng "${selectedShop.name}"`,
      );
      setShops((prev) => prev.filter((shop) => shop.id !== selectedShop.id));
      setIsRejectOpen(false);
      setIsDetailOpen(false);
      setRejectReason("");
      setRejectError(null);
    } catch (error: any) {
      console.error("Lỗi từ chối cửa hàng:", error);
      const errMsg = getErrorMessage(error);
      toast.error(errMsg);
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString("vi-VN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return dateString;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
            Duyệt Cửa Hàng
          </h1>
          <p className="text-muted-foreground text-base md:text-lg mt-2 max-w-4xl">
            Xem xét hồ sơ và phê duyệt hoặc từ chối các yêu cầu mở gian hàng mới
            trên sàn.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Badge
            variant="outline"
            className="px-4 py-1.5 text-sm bg-violet-50/50 dark:bg-violet-950/20 text-violet-600 dark:text-violet-400 border-violet-200"
          >
            Chờ duyệt: {shops.length}
          </Badge>
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            <div className="flex items-center justify-between border-b pb-4">
              <div className="h-6 w-1/4 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
              <div className="h-6 w-1/6 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
            </div>
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="flex items-center space-x-4 py-4 border-b last:border-0"
              >
                <div className="h-10 w-10 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                  <div className="h-3 w-1/2 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                </div>
                <div className="h-8 w-20 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : shops.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center min-h-[350px]">
            <div className="p-4 rounded-full bg-zinc-50 dark:bg-zinc-900 border text-zinc-400 dark:text-zinc-600 mb-4 shadow-inner">
              <Store className="h-8 w-8" />
            </div>
            <h3 className="font-bold text-lg text-foreground">
              Không có yêu cầu chờ duyệt
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Hiện tại không có gian hàng nào đăng ký mới hoặc đang đợi phê
              duyệt từ bạn.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-zinc-50 dark:bg-zinc-900/50">
              <TableRow>
                <TableHead className="pl-6 py-3.5 font-bold text-xs uppercase tracking-wider text-muted-foreground">
                  Thông tin gian hàng
                </TableHead>
                <TableHead className="py-3.5 font-bold text-xs uppercase tracking-wider text-muted-foreground">
                  Chủ sở hữu
                </TableHead>
                <TableHead className="py-3.5 font-bold text-xs uppercase tracking-wider text-muted-foreground">
                  Danh mục chính
                </TableHead>
                <TableHead className="py-3.5 font-bold text-xs uppercase tracking-wider text-muted-foreground">
                  Ngày đăng ký
                </TableHead>
                <TableHead className="pr-6 py-3.5 text-right font-bold text-xs uppercase tracking-wider text-muted-foreground">
                  Thao tác
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shops.map((shop) => (
                <TableRow
                  key={shop.id}
                  className="group hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 transition-all"
                >
                  <TableCell className="pl-6 py-6">
                    <div className="flex items-center space-x-4">
                      <img
                        src={
                          shop.logo_url ||
                          "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=80&q=80"
                        }
                        alt={shop.name}
                        className="h-16 w-16 rounded-xl object-cover border bg-zinc-100 shadow-sm"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=80&q=80";
                        }}
                      />
                      <div className="min-w-0">
                        <p className="font-extrabold text-lg text-foreground truncate group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                          {shop.name}
                        </p>
                        <span className="inline-flex items-center text-sm text-muted-foreground mt-1 max-w-[280px] truncate">
                          <MapPin className="h-4 w-4 mr-1.5 text-zinc-400 shrink-0" />
                          {shop.pickup_address}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-6">
                    <div className="text-lg font-bold text-foreground">
                      {shop.seller?.full_name || "Chưa cập nhật"}
                    </div>
                    <div className="text-sm text-muted-foreground truncate max-w-[180px] mt-1">
                      {shop.seller?.username || shop.seller?.email}
                    </div>
                  </TableCell>
                  <TableCell className="py-6">
                    <div className="flex flex-wrap gap-1.5 max-w-[200px]">
                      {shop.categories && shop.categories.length > 0 ? (
                        shop.categories.slice(0, 2).map((category) => (
                          <Badge
                            key={category.id}
                            variant="outline"
                            className="text-sm px-2.5 py-1 border-zinc-200 bg-zinc-50 dark:bg-zinc-900/50 font-semibold"
                          >
                            {category.name}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Không rõ
                        </span>
                      )}
                      {shop.categories && shop.categories.length > 2 && (
                        <Badge
                          variant="outline"
                          className="text-sm px-2.5 py-1 border-zinc-200 font-semibold"
                        >
                          +{shop.categories.length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-6 text-base font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-5 w-5 text-zinc-400" />
                      {formatDate(shop.created_at)}
                    </span>
                  </TableCell>
                  <TableCell className="pr-6 py-6 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <Button
                        variant="outline"
                        size="default"
                        className="h-10 text-sm font-semibold px-4"
                        onClick={() => {
                          setSelectedShop(shop);
                          setIsDetailOpen(true);
                        }}
                      >
                        <Eye className="h-4.5 w-4.5 mr-2" />
                        Chi tiết
                      </Button>
                      <Button
                        variant="default"
                        size="default"
                        className="h-10 text-sm font-semibold px-4 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                        onClick={() => {
                          setSelectedShop(shop);
                          setIsApproveOpen(true);
                        }}
                      >
                        <CheckCircle2 className="h-4.5 w-4.5 mr-2" />
                        Duyệt
                      </Button>
                      <Button
                        variant="destructive"
                        size="default"
                        className="h-10 text-sm font-semibold px-4"
                        onClick={() => {
                          setSelectedShop(shop);
                          setIsRejectOpen(true);
                        }}
                      >
                        <XCircle className="h-4.5 w-4.5 mr-2" />
                        Từ chối
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* --- DETAIL MODAL --- */}
      {selectedShop && isDetailOpen && (
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          {/* Override built-in DialogContent styles to make it wider + taller */}
          <DialogContent className="!w-[60vw] !max-w-[60vw] !max-h-[90vh] !flex !flex-col !overflow-hidden !p-0 !gap-0">
            {/* HEADER – fixed top */}
            <DialogHeader className="border-b pb-4 px-6 pt-6 shrink-0">
              <div className="flex items-center gap-3">
                <Store className="h-5 w-5 text-violet-600" />
                <DialogTitle className="text-xl font-bold">
                  Chi tiết gian hàng đăng ký
                </DialogTitle>
              </div>
              <DialogDescription>
                Hồ sơ thông tin gian hàng và các giấy tờ/hình ảnh minh chứng do
                chủ cửa hàng cung cấp.
              </DialogDescription>
            </DialogHeader>

            {/* SCROLLABLE BODY */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {/* Shop Banner preview */}
              <div className="relative h-52 w-full rounded-lg overflow-hidden border bg-zinc-100">
                <img
                  src={
                    selectedShop.banner_url ||
                    "https://images.unsplash.com/photo-1557821552-17105176677c?w=600&q=80"
                  }
                  alt="Banner"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "https://images.unsplash.com/photo-1557821552-17105176677c?w=600&q=80";
                  }}
                />
                <div className="absolute bottom-4 left-5 flex items-center gap-4">
                  <img
                    src={
                      selectedShop.logo_url ||
                      "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=80&q=80"
                    }
                    alt="Logo"
                    className="h-20 w-20 rounded-xl object-cover border-2 border-white dark:border-zinc-950 bg-white shadow-md"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=80&q=80";
                    }}
                  />
                  <div className="bg-black/60 backdrop-blur-xs text-white px-2.5 py-1 rounded-md text-xs font-bold shadow-md">
                    Logo & Banner của Cửa Hàng
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                {/* Left Column */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Tên cửa hàng
                    </h4>
                    <p className="text-base font-bold text-foreground mt-0.5">
                      {selectedShop.name}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Thông tin thanh toán ngân hàng
                    </h4>
                    <div className="flex items-start gap-2 mt-1 p-2.5 rounded-lg border bg-zinc-50 dark:bg-zinc-900/50">
                      <CreditCard className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
                      <div className="text-sm font-semibold text-foreground leading-tight space-y-1">
                        {(() => {
                          if (!selectedShop.bank_account_info) return <span>Chưa cập nhật</span>;
                          try {
                            const parsed = JSON.parse(selectedShop.bank_account_info);
                            if (parsed && typeof parsed === "object") {
                              if (Array.isArray(parsed)) {
                                return (
                                  <>
                                    <p><span className="text-muted-foreground text-xs font-medium">Ngân hàng:</span> {parsed[0] || "N/A"}</p>
                                    <p><span className="text-muted-foreground text-xs font-medium">Số TK:</span> {parsed[1] || "N/A"}</p>
                                    <p><span className="text-muted-foreground text-xs font-medium">Chủ TK:</span> {parsed[2] || "N/A"}</p>
                                  </>
                                );
                              }
                              return (
                                <>
                                  <p><span className="text-muted-foreground text-xs font-medium">Ngân hàng:</span> {parsed.bank_name || "N/A"}</p>
                                  <p><span className="text-muted-foreground text-xs font-medium">Số TK:</span> {parsed.bank_account_number || "N/A"}</p>
                                  <p><span className="text-muted-foreground text-xs font-medium">Chủ TK:</span> {parsed.bank_account_name || "N/A"}</p>
                                </>
                              );
                            }
                          } catch (e) {
                            const parts = selectedShop.bank_account_info.split(" - ");
                            if (parts.length >= 3) {
                              return (
                                <>
                                  <p><span className="text-muted-foreground text-xs font-medium">Ngân hàng:</span> {parts[0]}</p>
                                  <p><span className="text-muted-foreground text-xs font-medium">Số TK:</span> {parts[1]}</p>
                                  <p><span className="text-muted-foreground text-xs font-medium">Chủ TK:</span> {parts[2]}</p>
                                </>
                              );
                            }
                          }
                          return <span>{selectedShop.bank_account_info}</span>;
                        })()}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Địa chỉ kho / Lấy hàng
                    </h4>
                    <div className="flex items-start gap-2 mt-1 p-2.5 rounded-lg border bg-zinc-50 dark:bg-zinc-900/50">
                      <MapPin className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
                      <p className="text-sm font-semibold text-foreground leading-relaxed">
                        {selectedShop.pickup_address}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Thông tin người đại diện
                    </h4>
                    <div className="mt-1 p-3 rounded-lg border bg-zinc-50 dark:bg-zinc-900/50 space-y-1.5">
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">
                          Họ tên:
                        </span>
                        <p className="text-sm font-bold text-foreground leading-none mt-0.5">
                          {selectedShop.seller?.full_name || "Chưa cập nhật"}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">
                          Tên đăng nhập:
                        </span>
                        <p className="text-sm font-semibold text-foreground leading-none mt-0.5">
                          {selectedShop.seller?.username}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">
                          Email tài khoản:
                        </span>
                        <p className="text-sm font-semibold text-foreground leading-none mt-0.5 truncate">
                          {selectedShop.seller?.email}
                        </p>
                      </div>
                      {selectedShop.seller?.phone && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">
                            Số điện thoại:
                          </span>
                          <p className="text-sm font-semibold text-foreground leading-none mt-0.5">
                            {selectedShop.seller.phone}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column */}
                <div className="flex flex-col h-full">
                  {/* Spacer to align with left column's second block */}
                  <div className="h-[60px] shrink-0" />

                  <div>
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Danh mục kinh doanh
                    </h4>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedShop.categories &&
                      selectedShop.categories.length > 0 ? (
                        selectedShop.categories.map((category) => (
                          <Badge
                            key={category.id}
                            variant="outline"
                            className="text-sm py-1 px-3 border-zinc-200 font-semibold"
                          >
                            <Tag className="h-3.5 w-3.5 mr-1.5 text-zinc-400" />
                            {category.name}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Không có danh mục nào
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Gallery */}
                  <div className="mt-auto">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                      Hình ảnh sản phẩm / Cửa hàng
                    </h4>
                    {selectedShop.gallery && selectedShop.gallery.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2">
                        {selectedShop.gallery.map((media) => (
                          <a
                            key={media.id}
                            href={media.url}
                            target="_blank"
                            rel="noreferrer"
                            className="relative aspect-square rounded-lg overflow-hidden border bg-zinc-100 hover:opacity-85 transition group"
                          >
                            <img
                              src={media.url}
                              alt="Gallery"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-white">
                              <ExternalLink className="h-4 w-4" />
                            </div>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground p-3 text-center border border-dashed rounded-lg">
                        Không cung cấp ảnh bộ sưu tập (gallery)
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {/* end scrollable body */}

            {/* FOOTER – fixed bottom, always visible */}
            <DialogFooter className="border-t px-6 py-4 shrink-0 gap-2">
              <Button
                variant="outline"
                className="font-bold text-xs"
                onClick={() => setIsDetailOpen(false)}
              >
                Đóng
              </Button>
              <Button
                variant="destructive"
                className="font-bold text-xs"
                onClick={() => setIsRejectOpen(true)}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Từ chối hồ sơ
              </Button>
              <Button
                variant="default"
                className="font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                onClick={() => setIsApproveOpen(true)}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Duyệt hoạt động
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* --- APPROVE CONFIRMATION MODAL --- */}
      {selectedShop && isApproveOpen && (
        <Dialog open={isApproveOpen} onOpenChange={setIsApproveOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <DialogTitle className="text-center text-lg font-bold mt-3">
                Xác nhận duyệt gian hàng
              </DialogTitle>
              <DialogDescription className="text-center">
                Bạn có chắc chắn muốn duyệt hoạt động cho cửa hàng{" "}
                <strong>"{selectedShop.name}"</strong>? Người bán sẽ được phép
                đăng sản phẩm và giao dịch trên sàn.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                variant="default"
                className="w-full font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                onClick={handleApprove}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Đang duyệt...
                  </>
                ) : (
                  "Đồng ý duyệt"
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full font-bold text-xs"
                onClick={() => setIsApproveOpen(false)}
                disabled={actionLoading}
              >
                Hủy
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* --- REJECT CONFIRMATION MODAL --- */}
      {selectedShop && isRejectOpen && (
        <Dialog
          open={isRejectOpen}
          onOpenChange={(open) => {
            setIsRejectOpen(open);
            if (!open) {
              setRejectReason("");
              setRejectError(null);
            }
          }}
        >
          <DialogContent className="!max-w-md">
            <DialogHeader>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400">
                <AlertCircle className="h-6 w-6" />
              </div>
              <DialogTitle className="text-center text-lg font-bold mt-3">
                Từ chối duyệt gian hàng
              </DialogTitle>
              <DialogDescription className="text-center">
                Yêu cầu mở gian hàng của <strong>"{selectedShop.name}"</strong>{" "}
                sẽ bị từ chối. Trạng thái tài khoản người bán sẽ chuyển thành{" "}
                <strong>BỊ TỪ CHỐI</strong>. Bạn có muốn tiếp tục?
              </DialogDescription>
            </DialogHeader>

            {/* Reason input */}
            <div className="mt-2 space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                Lý do từ chối <span className="text-rose-500">*</span>
              </label>
              <textarea
                className={`w-full min-h-[96px] resize-none rounded-lg border bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent transition ${
                  rejectError
                    ? "border-rose-500 focus:ring-rose-400"
                    : "border-zinc-200 focus:ring-rose-400"
                }`}
                placeholder="Nhập lý do từ chối… (ví dụ: Hồ sơ thiếu thông tin, ảnh sản phẩm không rõ ràng…)"
                value={rejectReason}
                onChange={(e) => {
                  const val = e.target.value;
                  setRejectReason(val);
                  // Validate real-time
                  const result = RejectShopBody.safeParse({
                    reason: val.trim(),
                  });
                  if (!result.success) {
                    setRejectError(result.error.errors[0].message);
                  } else {
                    setRejectError(null);
                  }
                }}
                disabled={actionLoading}
              />
              {rejectError ? (
                <p className="text-xs text-rose-500 font-medium">
                  {rejectError}
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  Bắt buộc — người bán sẽ được thông báo lý do này.
                </p>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                variant="destructive"
                className="w-full font-bold text-xs"
                onClick={handleReject}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  "Xác nhận từ chối"
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full font-bold text-xs"
                onClick={() => setIsRejectOpen(false)}
                disabled={actionLoading}
              >
                Hủy
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
