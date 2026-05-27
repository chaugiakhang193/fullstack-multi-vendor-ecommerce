import React from "react";
import { Search, Eye, Check, X, Truck } from "lucide-react";

export default function SellerOrdersPage() {
  const dummyOrders = [
    {
      id: "DH-1002",
      customer: "Nguyễn Văn A",
      date: "19/05/2026 14:22",
      method: "COD",
      amount: "450,000 ₫",
      status: "pending",
    },
    {
      id: "DH-1001",
      customer: "Trần Thị B",
      date: "19/05/2026 11:05",
      method: "Chuyển khoản",
      amount: "1,200,000 ₫",
      status: "shipping",
    },
    {
      id: "DH-0999",
      customer: "Lê Văn C",
      date: "18/05/2026 18:30",
      method: "COD",
      amount: "320,000 ₫",
      status: "completed",
    },
    {
      id: "DH-0998",
      customer: "Phạm Văn D",
      date: "18/05/2026 09:15",
      method: "Chuyển khoản",
      amount: "890,000 ₫",
      status: "cancelled",
    },
    {
      id: "DH-0997",
      customer: "Hoàng Văn E",
      date: "17/05/2026 15:40",
      method: "COD",
      amount: "750,000 ₫",
      status: "processing",
    },
  ];

  const tabs = [
    { label: "Tất cả", count: 5, active: true },
    { label: "Chờ xác nhận", count: 1, active: false },
    { label: "Đang xử lý", count: 1, active: false },
    { label: "Đang giao hàng", count: 1, active: false },
    { label: "Đã hoàn thành", count: 1, active: false },
    { label: "Đã hủy", count: 1, active: false },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
          Quản lý Đơn hàng
        </h1>
        <p className="text-muted-foreground text-base mt-2">
          Theo dõi, xác nhận và xử lý đơn đặt hàng từ khách hàng của bạn.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 border-b gap-3 scrollbar-none">
        {tabs.map((tab, idx) => (
          <button
            key={idx}
            className={`whitespace-nowrap flex items-center space-x-2 px-5 py-3 text-base font-bold rounded-t-xl transition border-b-2 ${
              tab.active
                ? "border-violet-600 text-violet-600 bg-violet-50/40 dark:bg-violet-950/20"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                tab.active
                  ? "bg-violet-600 text-white"
                  : "bg-muted text-muted-foreground font-extrabold"
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 bg-card p-6 rounded-2xl border">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-4 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Tìm kiếm đơn hàng theo mã, khách hàng..."
            className="w-full pl-12 pr-6 py-3.5 text-base border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-background"
          />
        </div>
        <div className="flex items-center space-x-3">
          <select className="text-sm font-bold px-4 py-3 border rounded-xl hover:bg-muted transition bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/20">
            <option>Lọc theo phương thức</option>
            <option>COD</option>
            <option>Chuyển khoản</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="rounded-2xl border bg-card text-card-foreground shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b bg-muted/40 text-sm font-extrabold text-muted-foreground uppercase">
                <th className="p-6">Mã đơn</th>
                <th className="p-6">Khách hàng</th>
                <th className="p-6">Ngày đặt</th>
                <th className="p-6 text-center">Thanh toán</th>
                <th className="p-6 text-right">Tổng tiền</th>
                <th className="p-6 text-center">Trạng thái</th>
                <th className="p-6 text-center w-[180px]">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y text-base">
              {dummyOrders.map((order) => (
                <tr
                  key={order.id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="p-6 font-bold text-violet-600 dark:text-violet-400">
                    {order.id}
                  </td>
                  <td className="p-6 font-bold text-foreground">{order.customer}</td>
                  <td className="p-6 text-sm text-muted-foreground">{order.date}</td>
                  <td className="p-6 text-center">
                    <span className="text-sm px-3 py-1 rounded bg-muted font-bold">
                      {order.method}
                    </span>
                  </td>
                  <td className="p-6 text-right font-black text-foreground">
                    {order.amount}
                  </td>
                  <td className="p-6 text-center">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                        order.status === "completed"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : order.status === "shipping"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                            : order.status === "processing"
                              ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                              : order.status === "pending"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                      }`}
                    >
                      {order.status === "completed"
                        ? "Đã giao"
                        : order.status === "shipping"
                          ? "Đang giao"
                          : order.status === "processing"
                            ? "Đang xử lý"
                            : order.status === "pending"
                              ? "Chờ xác nhận"
                              : "Đã hủy"}
                    </span>
                  </td>
                  <td className="p-6">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        title="Chi tiết"
                        className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition"
                      >
                        <Eye className="h-5 w-5" />
                      </button>
                      {order.status === "pending" && (
                        <>
                          <button
                            title="Xác nhận đơn"
                            className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/40 transition"
                          >
                            <Check className="h-5 w-5" />
                          </button>
                          <button
                            title="Từ chối đơn"
                            className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/40 transition"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </>
                      )}
                      {order.status === "processing" && (
                        <button
                          title="Giao cho đơn vị vận chuyển"
                          className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950/40 transition"
                        >
                          <Truck className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
