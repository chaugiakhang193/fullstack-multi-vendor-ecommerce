"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  Users,
  Search,
  Loader2,
  Calendar,
  Ban,
  Lock,
  CheckCircle2,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import adminUsersApiRequest from "@/apiRequests/users/admin-users";
import {
  AdminUserItemType,
  AdminUserPaginationMetaType,
  UpdateUserStatusBodyType,
} from "@/schemaValidations/users/admin-users.schema";
import { getErrorMessage } from "@/lib/http";
import { useDebounce } from "@/hooks/useDebounce";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const PAGE_SIZE = 10;

type StatusValue = UpdateUserStatusBodyType["status"];

// Một thao tác đổi trạng thái đang chờ xác nhận
interface PendingAction {
  user: AdminUserItemType;
  status: StatusValue;
  label: string; // nhãn hành động hiển thị trên modal (vd: "Cấm tài khoản")
}

const roleSelectItems = [
  { value: "all", label: "Tất cả vai trò" },
  { value: "customer", label: "Khách hàng" },
  { value: "seller", label: "Người bán" },
  { value: "admin", label: "Quản trị" },
];

const statusSelectItems = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "active", label: "Đang hoạt động" },
  { value: "suspended", label: "Tạm khóa" },
  { value: "banned", label: "Bị cấm" },
];

// Map trạng thái -> nhãn + variant Badge
function statusMeta(status: string): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  className: string;
} {
  switch (status) {
    case "active":
      return {
        label: "Đang hoạt động",
        variant: "outline",
        className:
          "border-emerald-200 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400",
      };
    case "suspended":
      return {
        label: "Tạm khóa",
        variant: "outline",
        className:
          "border-amber-200 bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400",
      };
    case "banned":
      return { label: "Bị cấm", variant: "destructive", className: "" };
    default:
      return { label: status, variant: "secondary", className: "" };
  }
}

// Map vai trò -> nhãn + style
function roleMeta(role: string): { label: string; className: string } {
  switch (role) {
    case "admin":
      return {
        label: "Quản trị",
        className:
          "border-violet-200 bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400",
      };
    case "seller":
      return {
        label: "Người bán",
        className:
          "border-blue-200 bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400",
      };
    default:
      return {
        label: "Khách hàng",
        className:
          "border-zinc-200 bg-zinc-50 text-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-400",
      };
  }
}

function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserItemType[]>([]);
  const [meta, setMeta] = useState<AdminUserPaginationMetaType | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Bộ lọc
  const [role, setRole] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const debouncedSearch = useDebounce(search, 400);
  const [page, setPage] = useState<number>(1);

  // Modal xác nhận đổi trạng thái
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Chống response cũ về trễ ghi đè response mới (đổi filter/search nhanh)
  const reqIdRef = useRef(0);

  const fetchUsers = useCallback(async () => {
    const myId = ++reqIdRef.current;
    setLoading(true);
    try {
      const res = await adminUsersApiRequest.getUsers({
        page,
        limit: PAGE_SIZE,
        role: role !== "all" ? role : undefined,
        status: status !== "all" ? status : undefined,
        search: debouncedSearch || undefined,
      });
      if (myId !== reqIdRef.current) return; // bỏ response cũ
      setUsers(res.data.items || []);
      setMeta(res.data.meta);
    } catch (error) {
      if (myId !== reqIdRef.current) return;
      const errMsg = getErrorMessage(error);
      toast.error(errMsg);
      setUsers([]);
      setMeta(null);
    } finally {
      if (myId === reqIdRef.current) setLoading(false);
    }
  }, [page, role, status, debouncedSearch]);

  // Đổi bộ lọc -> luôn về trang 1 (tránh đứng ở trang không tồn tại)
  useEffect(() => {
    setPage(1);
  }, [role, status, debouncedSearch]);

  // Fetch khi bộ lọc hoặc trang đổi
  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    setActionLoading(true);
    try {
      const res = await adminUsersApiRequest.updateUserStatus(
        pendingAction.user.id,
        { status: pendingAction.status },
      );
      toast.success(
        res.message ||
          `Đã cập nhật trạng thái cho "${pendingAction.user.username}"`,
      );
      setPendingAction(null);
      // Refetch để đồng bộ với bộ lọc hiện tại (vd đang lọc theo status)
      await fetchUsers();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  };

  // Các nút action theo trạng thái hiện tại (chỉ cho dòng KHÔNG phải admin)
  const renderActions = (user: AdminUserItemType) => {
    if (user.role === "admin") {
      return (
        <span className="text-xs font-medium text-muted-foreground italic">
          Tài khoản quản trị
        </span>
      );
    }

    const buttons: React.ReactNode[] = [];
    const open = (status: StatusValue, label: string) =>
      setPendingAction({ user, status, label });

    if (user.status !== "active") {
      buttons.push(
        <Button
          key="activate"
          variant="outline"
          size="sm"
          className="h-8 text-xs font-semibold border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
          onClick={() => open("active", "Mở lại tài khoản")}
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
          Mở lại
        </Button>,
      );
    }
    if (user.status === "active") {
      buttons.push(
        <Button
          key="suspend"
          variant="outline"
          size="sm"
          className="h-8 text-xs font-semibold border-amber-200 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
          onClick={() => open("suspended", "Tạm khóa tài khoản")}
        >
          <Lock className="h-3.5 w-3.5 mr-1.5" />
          Tạm khóa
        </Button>,
      );
    }
    if (user.status !== "banned") {
      buttons.push(
        <Button
          key="ban"
          variant="destructive"
          size="sm"
          className="h-8 text-xs font-semibold"
          onClick={() => open("banned", "Cấm tài khoản")}
        >
          <Ban className="h-3.5 w-3.5 mr-1.5" />
          Cấm
        </Button>,
      );
    }
    return <div className="flex items-center justify-end gap-2">{buttons}</div>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
            Quản lý Người dùng
          </h1>
          <p className="text-muted-foreground text-base md:text-lg mt-2 max-w-4xl">
            Xem, tìm kiếm và kiểm soát trạng thái tài khoản người dùng toàn sàn.
          </p>
        </div>
        {meta && (
          <Badge
            variant="outline"
            className="px-4 py-1.5 text-sm bg-violet-50/50 dark:bg-violet-950/20 text-violet-600 dark:text-violet-400 border-violet-200 self-start sm:self-auto"
          >
            Tổng: {meta.totalItems}
          </Badge>
        )}
      </div>

      {/* Thanh bộ lọc */}
      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo username hoặc email…"
            className="pl-9"
          />
        </div>
        <Select value={role} onValueChange={(val) => setRole(val ?? "all")} items={roleSelectItems}>
          <SelectTrigger className="w-full md:w-[180px]" size="default">
            <SelectValue placeholder="Vai trò" />
          </SelectTrigger>
          <SelectContent>
            {roleSelectItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(val) => setStatus(val ?? "all")}
          items={statusSelectItems}
        >
          <SelectTrigger className="w-full md:w-[190px]" size="default">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            {statusSelectItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bảng */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                className="flex items-center space-x-4 py-3 border-b last:border-0"
              >
                <div className="h-11 w-11 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/4 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                  <div className="h-3 w-1/3 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                </div>
                <div className="h-8 w-28 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center min-h-[320px]">
            <div className="p-4 rounded-full bg-zinc-50 dark:bg-zinc-900 border text-zinc-400 dark:text-zinc-600 mb-4 shadow-inner">
              <Users className="h-8 w-8" />
            </div>
            <h3 className="font-bold text-lg text-foreground">
              Không tìm thấy người dùng
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Thử đổi bộ lọc hoặc từ khóa tìm kiếm khác.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-zinc-50 dark:bg-zinc-900/50">
              <TableRow>
                <TableHead className="pl-6 py-3.5 font-bold text-xs uppercase tracking-wider text-muted-foreground">
                  Người dùng
                </TableHead>
                <TableHead className="py-3.5 font-bold text-xs uppercase tracking-wider text-muted-foreground">
                  Vai trò
                </TableHead>
                <TableHead className="py-3.5 font-bold text-xs uppercase tracking-wider text-muted-foreground">
                  Trạng thái
                </TableHead>
                <TableHead className="py-3.5 font-bold text-xs uppercase tracking-wider text-muted-foreground">
                  Ngày tạo
                </TableHead>
                <TableHead className="pr-6 py-3.5 text-right font-bold text-xs uppercase tracking-wider text-muted-foreground">
                  Thao tác
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const sMeta = statusMeta(user.status);
                const rMeta = roleMeta(user.role);
                return (
                  <TableRow
                    key={user.id}
                    className="group hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 transition-all"
                  >
                    <TableCell className="pl-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="h-11 w-11 rounded-full overflow-hidden bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center font-bold text-white shrink-0">
                          {user.avatar_url ? (
                            <img
                              src={user.avatar_url}
                              alt={user.username}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            user.username.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-foreground truncate">
                            {user.full_name || user.username}
                          </p>
                          <p className="text-sm text-muted-foreground truncate max-w-[240px]">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <Badge variant="outline" className={rMeta.className}>
                        {user.role === "admin" && (
                          <ShieldCheck className="h-3 w-3 mr-1" />
                        )}
                        {rMeta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-4">
                      <Badge variant={sMeta.variant} className={sMeta.className}>
                        {sMeta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-4 text-sm font-medium text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-4 w-4 text-zinc-400" />
                        {formatDate(user.created_at)}
                      </span>
                    </TableCell>
                    <TableCell className="pr-6 py-4 text-right">
                      {renderActions(user)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Phân trang */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Trang <span className="font-bold text-foreground">{meta.page}</span>{" "}
            / {meta.totalPages} — {meta.totalItems} người dùng
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={loading || meta.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={loading || meta.page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Sau
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Modal xác nhận đổi trạng thái */}
      {pendingAction && (
        <Dialog
          open={!!pendingAction}
          onOpenChange={(open) => {
            if (!open) setPendingAction(null);
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <div
                className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
                  pendingAction.status === "active"
                    ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400"
                    : pendingAction.status === "suspended"
                      ? "bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400"
                      : "bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400"
                }`}
              >
                {pendingAction.status === "active" ? (
                  <CheckCircle2 className="h-6 w-6" />
                ) : pendingAction.status === "suspended" ? (
                  <Lock className="h-6 w-6" />
                ) : (
                  <Ban className="h-6 w-6" />
                )}
              </div>
              <DialogTitle className="text-center text-lg font-bold mt-3">
                {pendingAction.label}
              </DialogTitle>
              <DialogDescription className="text-center">
                Xác nhận đổi trạng thái của{" "}
                <strong>"{pendingAction.user.username}"</strong> ({pendingAction.user.email}).
                {pendingAction.status === "banned" &&
                  " Tài khoản bị cấm sẽ không thể thực hiện các thao tác trên sàn."}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                variant={
                  pendingAction.status === "banned" ? "destructive" : "default"
                }
                className="w-full font-bold text-xs"
                onClick={handleConfirmAction}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  "Xác nhận"
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full font-bold text-xs"
                onClick={() => setPendingAction(null)}
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
