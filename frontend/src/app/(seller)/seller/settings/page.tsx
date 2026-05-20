import React from "react";
import { Save, Store, Mail, Phone, MapPin, Info } from "lucide-react";

export default function SellerSettingsPage() {
  return (
    <div className="space-y-4 max-w-4xl animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
          Cài đặt Cửa hàng
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Cập nhật thông tin chi tiết về shop của bạn hiển thị với khách hàng.
        </p>
      </div>

      {/* Settings Form Grid */}
      <div className="bg-card text-card-foreground rounded-xl border shadow-sm p-4 space-y-4">
        {/* Profile header decoration */}
        <div className="flex items-center space-x-4 pb-6 border-b">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white shadow-md">
            <Store className="h-8 w-8" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Giang Kha Store</h3>
            <p className="text-xs text-muted-foreground">ID Cửa hàng: #SHOP-992182</p>
          </div>
        </div>

        <form className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Shop Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold flex items-center gap-1.5" htmlFor="shop-name">
                <Store className="h-4 w-4 text-violet-500" /> Tên cửa hàng
              </label>
              <input
                id="shop-name"
                type="text"
                defaultValue="Giang Kha Store"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-background"
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold flex items-center gap-1.5" htmlFor="email">
                <Mail className="h-4 w-4 text-violet-500" /> Email liên hệ
              </label>
              <input
                id="email"
                type="email"
                defaultValue="giangkhastore@gmail.com"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-background"
              />
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold flex items-center gap-1.5" htmlFor="phone">
                <Phone className="h-4 w-4 text-violet-500" /> Số điện thoại
              </label>
              <input
                id="phone"
                type="text"
                defaultValue="0987654321"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-background"
              />
            </div>

            {/* Address */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-semibold flex items-center gap-1.5" htmlFor="address">
                <MapPin className="h-4 w-4 text-violet-500" /> Địa chỉ cửa hàng
              </label>
              <input
                id="address"
                type="text"
                defaultValue="123 Đường Ba Tháng Hai, Quận 10, TP. Hồ Chí Minh"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-background"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-semibold flex items-center gap-1.5" htmlFor="description">
                <Info className="h-4 w-4 text-violet-500" /> Mô tả cửa hàng
              </label>
              <textarea
                id="description"
                rows={4}
                defaultValue="Cửa hàng chuyên cung cấp quần áo thời trang cao cấp dành cho nam và nữ với chất lượng tốt nhất và giá cả phải chăng."
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-background resize-none"
              />
            </div>
          </div>

          {/* Action button */}
          <div className="pt-4 border-t flex justify-end">
            <button
              type="button"
              className="flex items-center text-xs font-semibold px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition shadow-md shadow-violet-500/20"
            >
              <Save className="h-4 w-4 mr-1.5" /> Lưu thay đổi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
