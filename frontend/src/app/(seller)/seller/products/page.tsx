import React from "react";
import { Plus, Search, Filter, Edit, Trash, FileSpreadsheet } from "lucide-react";

export default function SellerProductsPage() {
  const dummyProducts = [
    { id: 1, name: "Áo thun Nam Cotton 100%", sku: "TSH-001", price: "250,000 ₫", stock: 45, sales: 120, status: "active" },
    { id: 2, name: "Quần Jean Slimfit co giãn", sku: "JEAN-002", price: "450,000 ₫", stock: 12, sales: 85, status: "active" },
    { id: 3, name: "Giày Sneaker Thể Thao RunPro", sku: "SNEAK-003", price: "890,000 ₫", stock: 0, sales: 310, status: "out_of_stock" },
    { id: 4, name: "Mũ Lưỡi Trai Unisex Canvas", sku: "CAP-004", price: "120,000 ₫", stock: 110, sales: 45, status: "active" },
    { id: 5, name: "Balo Chống Nước Đa Năng", sku: "BAG-005", price: "680,000 ₫", stock: 5, sales: 98, status: "active" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
            Quản lý Sản phẩm
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Thêm, chỉnh sửa và quản lý danh sách sản phẩm trong cửa hàng của bạn.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button className="flex items-center text-xs font-semibold px-3 py-2 border rounded-lg hover:bg-muted transition shadow-sm bg-background">
            <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Xuất Excel
          </button>
          <button className="flex items-center text-xs font-semibold px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition shadow-md shadow-violet-500/20">
            <Plus className="h-4 w-4 mr-1.5" /> Thêm sản phẩm
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-4 rounded-xl border">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Tìm kiếm sản phẩm theo tên, SKU..."
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-background"
          />
        </div>
        <div className="flex items-center space-x-2">
          <button className="flex items-center text-xs font-semibold px-3 py-2 border rounded-lg hover:bg-muted transition bg-background">
            <Filter className="h-4 w-4 mr-1.5" /> Bộ lọc
          </button>
          <select className="text-xs font-semibold px-3 py-2 border rounded-lg hover:bg-muted transition bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/20">
            <option>Tất cả trạng thái</option>
            <option>Còn hàng</option>
            <option>Hết hàng</option>
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b bg-muted/40 text-xs font-bold text-muted-foreground uppercase">
                <th className="p-4 w-[80px]">Mã ID</th>
                <th className="p-4">Sản phẩm</th>
                <th className="p-4">SKU</th>
                <th className="p-4 text-right">Giá bán</th>
                <th className="p-4 text-center">Kho hàng</th>
                <th className="p-4 text-center">Đã bán</th>
                <th className="p-4 text-center">Trạng thái</th>
                <th className="p-4 text-center w-[120px]">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {dummyProducts.map((product) => (
                <tr key={product.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-4 font-mono text-xs text-muted-foreground">#{product.id}</td>
                  <td className="p-4 font-semibold text-foreground">{product.name}</td>
                  <td className="p-4 text-muted-foreground">{product.sku}</td>
                  <td className="p-4 text-right font-semibold">{product.price}</td>
                  <td className="p-4 text-center">{product.stock}</td>
                  <td className="p-4 text-center font-medium text-violet-600 dark:text-violet-400">{product.sales}</td>
                  <td className="p-4 text-center">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        product.status === "active"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                      }`}
                    >
                      {product.status === "active" ? "Còn hàng" : "Hết hàng"}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-center space-x-2">
                      <button className="p-1.5 rounded-md hover:bg-violet-100 dark:hover:bg-violet-950 text-violet-600 dark:text-violet-400 transition">
                        <Edit className="h-4 w-4" />
                      </button>
                      <button className="p-1.5 rounded-md hover:bg-rose-100 dark:hover:bg-rose-950 text-rose-600 dark:text-rose-400 transition">
                        <Trash className="h-4 w-4" />
                      </button>
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
