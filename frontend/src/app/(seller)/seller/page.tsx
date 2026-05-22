import React from "react";
import {
  TrendingUp,
  Package,
  ShoppingCart,
  Users,
  ArrowUpRight,
  Activity,
} from "lucide-react";

export default function SellerDashboardPage() {
  const stats = [
    {
      title: "Tổng doanh thu",
      value: "45,231,000 ₫",
      change: "+12.5% so với tháng trước",
      icon: <TrendingUp className="h-5 w-5 text-violet-500" />,
      gradient: "from-violet-500/10 to-purple-500/10 border-violet-500/20",
    },
    {
      title: "Đơn hàng mới",
      value: "+18",
      change: "+4 đơn hàng chờ duyệt",
      icon: <ShoppingCart className="h-5 w-5 text-emerald-500" />,
      gradient: "from-emerald-500/10 to-teal-500/10 border-emerald-500/20",
    },
    {
      title: "Sản phẩm đang bán",
      value: "142",
      change: "+2 sản phẩm mới tuần này",
      icon: <Package className="h-5 w-5 text-blue-500" />,
      gradient: "from-blue-500/10 to-cyan-500/10 border-blue-500/20",
    },
    {
      title: "Lượt truy cập",
      value: "12,482",
      change: "+8.2% từ tuần trước",
      icon: <Users className="h-5 w-5 text-pink-500" />,
      gradient: "from-pink-500/10 to-rose-500/10 border-pink-500/20",
    },
  ];

  const recentOrders = [
    {
      id: "DH-1002",
      customer: "Nguyễn Văn A",
      status: "Chờ xác nhận",
      date: "Hôm nay, 14:22",
      amount: "450,000 ₫",
    },
    {
      id: "DH-1001",
      customer: "Trần Thị B",
      status: "Đang giao",
      date: "Hôm nay, 11:05",
      amount: "1,200,000 ₫",
    },
    {
      id: "DH-0999",
      customer: "Lê Văn C",
      status: "Đã giao",
      date: "Hôm qua, 18:30",
      amount: "320,000 ₫",
    },
    {
      id: "DH-0998",
      customer: "Phạm Văn D",
      status: "Đã hủy",
      date: "Hôm qua, 09:15",
      amount: "890,000 ₫",
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
          Tổng quan bán hàng
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Theo dõi tình hình kinh doanh, doanh số và đơn hàng của shop bạn.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, idx) => (
          <div
            key={idx}
            className={`rounded-xl border bg-gradient-to-br ${stat.gradient} p-4 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md`}
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
      <div className="grid gap-3 md:grid-cols-1 lg:grid-cols-7">
        {/* Recent Orders Card */}
        <div className="col-span-4 rounded-xl border bg-card text-card-foreground shadow-sm p-4">
          <div className="flex items-center justify-between pb-4 border-b">
            <div>
              <h3 className="font-semibold text-lg leading-none">
                Đơn hàng mới nhất
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Bạn có{" "}
                {recentOrders.filter((o) => o.status === "Chờ xác nhận").length}{" "}
                đơn hàng cần xử lý.
              </p>
            </div>
            <button className="flex items-center text-xs font-semibold text-violet-600 hover:text-violet-700 transition">
              Xem tất cả <ArrowUpRight className="h-4 w-4 ml-1" />
            </button>
          </div>
          <div className="mt-4 divide-y">
            {recentOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between py-3 hover:bg-muted/50 rounded-lg px-2 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400">
                    <Activity className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      {order.id} - {order.customer}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.date}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{order.amount}</p>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      order.status === "Đã giao"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : order.status === "Đang giao"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                          : order.status === "Chờ xác nhận"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                    }`}
                  >
                    {order.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Shop Performance Summary Card */}
        <div className="col-span-3 rounded-xl border bg-card text-card-foreground shadow-sm p-4 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-lg leading-none">
              Hiệu suất Cửa hàng
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Phân tích hiệu suất bán hàng tổng thể.
            </p>
            <div className="mt-6 space-y-4">
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>Tỷ lệ hoàn thành đơn</span>
                  <span className="text-violet-600">92%</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full"
                    style={{ width: "92%" }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>Đánh giá từ khách hàng</span>
                  <span className="text-amber-500">4.8 / 5.0</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: "96%" }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>Tốc độ chuẩn bị hàng</span>
                  <span className="text-emerald-600">Nhanh (1.2 ngày)</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: "85%" }}
                  />
                </div>
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
