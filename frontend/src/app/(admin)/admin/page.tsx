"use client";

import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  Store,
  Users,
  Layers,
  ArrowUpRight,
  Shield,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";
import adminStatsApiRequest from "@/apiRequests/statistics/admin-stats";
import { AdminStatsType } from "@/schemaValidations/statistics/admin-stats.schema";
import { getErrorMessage } from "@/lib/http";
import { formatVnd } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStatsType | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await adminStatsApiRequest.getOverview();
        setStats(response.data);
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const statCards = stats
    ? [
        {
          title: "Tổng người dùng",
          value: stats.total_users.toLocaleString("vi-VN"),
          change: "Toàn sàn",
          icon: <Users className="h-6 w-6 text-blue-500" />,
          gradient: "from-blue-500/10 to-cyan-500/10 border-blue-500/20",
        },
        {
          title: "Tổng cửa hàng",
          value: stats.total_shops.toLocaleString("vi-VN"),
          change: "Toàn sàn",
          icon: <Store className="h-6 w-6 text-violet-500" />,
          gradient: "from-violet-500/10 to-indigo-500/10 border-violet-500/20",
        },
        {
          title: "Cửa hàng chờ duyệt",
          value: stats.pending_shops.toLocaleString("vi-VN"),
          change: "Cần phê duyệt",
          icon: <Shield className="h-6 w-6 text-amber-500" />,
          gradient: "from-amber-500/10 to-orange-500/10 border-amber-500/20",
        },
        {
          title: "Tổng danh mục",
          value: stats.total_categories.toLocaleString("vi-VN"),
          change: "Toàn sàn",
          icon: <Layers className="h-6 w-6 text-pink-500" />,
          gradient: "from-pink-500/10 to-rose-500/10 border-pink-500/20",
        },
        {
          title: "Tổng đơn hàng",
          value: stats.total_orders.toLocaleString("vi-VN"),
          change: "Toàn sàn",
          icon: <ShoppingBag className="h-6 w-6 text-emerald-500" />,
          gradient: "from-emerald-500/10 to-teal-500/10 border-emerald-500/20",
        },
        {
          title: "Doanh thu (đã giao)",
          value: formatVnd.format(stats.total_revenue),
          change: "Đơn giao thành công",
          icon: <TrendingUp className="h-6 w-6 text-rose-500" />,
          gradient: "from-rose-500/10 to-red-500/10 border-rose-500/20",
        },
      ]
    : [];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Title */}
      <div>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
          Tổng quan Quản trị
        </h1>
        <p className="text-muted-foreground text-base md:text-lg mt-2 max-w-4xl">
          Hệ thống giám sát, phê duyệt và quản lý toàn bộ hoạt động của Giang
          Kha Multi-Vendor E-Commerce.
        </p>
      </div>

      {/* Stats Grid */}
      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-xl border p-6 shadow-sm bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col justify-between h-[146px]"
            >
              <div className="flex items-center justify-between pb-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-11 w-11 rounded-lg" />
              </div>
              <div className="mt-2 space-y-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {statCards.map((stat, idx) => (
            <div
              key={idx}
              className={`rounded-xl border bg-gradient-to-br ${stat.gradient} p-6 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md`}
            >
              <div className="flex items-center justify-between space-y-0 pb-2">
                <span className="text-base font-semibold text-muted-foreground">
                  {stat.title}
                </span>
                <div className="p-2.5 rounded-lg bg-background/50 backdrop-blur-sm border shadow-sm">
                  {stat.icon}
                </div>
              </div>
              <div className="mt-2">
                <span className="text-3xl font-extrabold tracking-tight">
                  {stat.value}
                </span>
                <p className="text-sm text-muted-foreground mt-1">
                  {stat.change}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detailed Section */}
      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-7">
        <div className="col-span-4 rounded-xl border bg-card text-card-foreground shadow-sm p-6">
          <div className="flex items-center justify-between pb-4 border-b">
            <div>
              <h3 className="font-extrabold text-xl leading-none">
                Cửa hàng mới đăng ký
              </h3>
              <p className="text-sm text-muted-foreground mt-2">
                Danh sách các yêu cầu mở gian hàng cần được xem xét phê duyệt.
              </p>
            </div>
            <button className="flex items-center text-sm font-bold text-violet-600 hover:text-violet-700 transition">
              Xem tất cả <ArrowUpRight className="h-4.5 w-4.5 ml-1" />
            </button>
          </div>
          <div className="mt-4 text-base text-muted-foreground py-10 text-center">
            Tính năng hiển thị yêu cầu đang được triển khai. Vui lòng chuyển qua
            tab "Duyệt cửa hàng".
          </div>
        </div>

        <div className="col-span-3 rounded-xl border bg-card text-card-foreground shadow-sm p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-extrabold text-xl leading-none">
              Hoạt động Hệ thống
            </h3>
            <p className="text-sm text-muted-foreground mt-2">
              Thông số vận hành hiện tại.
            </p>
            <div className="mt-6 text-base space-y-4">
              <div className="flex justify-between border-b pb-2.5">
                <span className="text-muted-foreground">Server API:</span>
                <span className="font-bold text-emerald-600">
                  Đang hoạt động (8080)
                </span>
              </div>
              <div className="flex justify-between border-b pb-2.5">
                <span className="text-muted-foreground">Cơ sở dữ liệu:</span>
                <span className="font-bold text-emerald-600">
                  Connected
                </span>
              </div>
              <div className="flex justify-between pb-2.5">
                <span className="text-muted-foreground">Phiên bản FE:</span>
                <span className="font-bold">Next.js 15.0</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t text-sm text-muted-foreground flex items-center justify-between">
            <span>Cập nhật mới nhất: Vừa xong</span>
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
