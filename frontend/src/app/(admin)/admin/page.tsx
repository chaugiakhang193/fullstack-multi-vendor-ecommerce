import React from "react";
import {
  TrendingUp,
  Store,
  Users,
  Layers,
  ArrowUpRight,
  Shield,
} from "lucide-react";

export default function AdminDashboardPage() {
  const stats = [
    {
      title: "Tổng số cửa hàng",
      value: "54",
      change: "+4 cửa hàng mới tháng này",
      icon: <Store className="h-5 w-5 text-violet-500" />,
      gradient: "from-violet-500/10 to-indigo-500/10 border-violet-500/20",
    },
    {
      title: "Cửa hàng chờ duyệt",
      value: "8",
      change: "Cần xử lý phê duyệt ngay",
      icon: <Shield className="h-5 w-5 text-amber-500" />,
      gradient: "from-amber-500/10 to-orange-500/10 border-amber-500/20",
    },
    {
      title: "Tổng người dùng",
      value: "1,248",
      change: "+12.5% từ tháng trước",
      icon: <Users className="h-5 w-5 text-blue-500" />,
      gradient: "from-blue-500/10 to-cyan-500/10 border-blue-500/20",
    },
    {
      title: "Tổng danh mục",
      value: "16",
      change: "Đã phân cấp đa cấp",
      icon: <Layers className="h-5 w-5 text-pink-500" />,
      gradient: "from-pink-500/10 to-rose-500/10 border-pink-500/20",
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
          Tổng quan Quản trị
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Hệ thống giám sát, phê duyệt và quản lý toàn bộ hoạt động của Giang
          Kha Multi-Vendor E-Commerce.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, idx) => (
          <div
            key={idx}
            className={`rounded-xl border bg-gradient-to-br ${stat.gradient} p-6 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md`}
          >
            <div className="flex items-center justify-between space-y-0 pb-2">
              <span className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </span>
              <div className="p-2 rounded-lg bg-background/50 backdrop-blur-sm border shadow-sm">
                {stat.icon}
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold tracking-tight">
                {stat.value}
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                {stat.change}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Detailed Section */}
      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-7">
        <div className="col-span-4 rounded-xl border bg-card text-card-foreground shadow-sm p-6">
          <div className="flex items-center justify-between pb-4 border-b">
            <div>
              <h3 className="font-semibold text-lg leading-none">
                Cửa hàng mới đăng ký
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Danh sách các yêu cầu mở gian hàng cần được xem xét phê duyệt.
              </p>
            </div>
            <button className="flex items-center text-xs font-semibold text-violet-600 hover:text-violet-700 transition">
              Xem tất cả <ArrowUpRight className="h-4 w-4 ml-1" />
            </button>
          </div>
          <div className="mt-4 text-sm text-muted-foreground py-8 text-center">
            Tính năng hiển thị yêu cầu đang được triển khai. Vui lòng chuyển qua
            tab "Duyệt cửa hàng".
          </div>
        </div>

        <div className="col-span-3 rounded-xl border bg-card text-card-foreground shadow-sm p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-lg leading-none">
              Hoạt động Hệ thống
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Thông số vận hành hiện tại.
            </p>
            <div className="mt-6 text-sm space-y-4">
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Server API:</span>
                <span className="font-semibold text-emerald-600">
                  Đang hoạt động (8080)
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Cơ sở dữ liệu:</span>
                <span className="font-semibold text-emerald-600">
                  Connected
                </span>
              </div>
              <div className="flex justify-between pb-2">
                <span className="text-muted-foreground">Phiên bản FE:</span>
                <span className="font-semibold">Next.js 15.0</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t text-xs text-muted-foreground flex items-center justify-between">
            <span>Cập nhật mới nhất: Vừa xong</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
