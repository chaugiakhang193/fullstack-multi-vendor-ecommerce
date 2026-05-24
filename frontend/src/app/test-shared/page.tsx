"use client";

import React, { useState } from "react";
import {
  Sparkles,
  ShoppingBag,
  ShoppingCart,
  Package,
  Layers,
  Star,
  RefreshCw,
  Search,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

// Newly created components
import SkeletonProductCard from "@/components/skeleton-product-card";
import SkeletonTableRows from "@/components/skeleton-table-rows";
import {
  EmptyState,
  EmptyProducts,
  EmptyCart,
  EmptyOrders,
} from "@/components/empty-state";
import { StarRating } from "@/components/star-rating";

// Custom Mock Product Card for verification
function MockProductCard({ name, price, rating, shopName }: { name: string; price: number; rating: number; shopName: string }) {
  const formatPrice = (val: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(val);
  };
  return (
    <div className="relative rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden flex flex-col h-full hover:scale-[1.02] hover:shadow-md transition-all duration-300">
      <div className="relative w-full aspect-square bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-muted-foreground text-xs font-medium">
        [ Ảnh {name} ]
      </div>
      <div className="p-4 flex-1 flex flex-col justify-between gap-2.5">
        <div className="space-y-1.5">
          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-violet-500 shrink-0" />
            <span>{shopName}</span>
          </div>
          <h3 className="text-xs font-bold text-foreground leading-snug line-clamp-2 h-8">
            {name}
          </h3>
        </div>
        <div className="space-y-1.5">
          <StarRating rating={rating} size="sm" showValue />
          <div className="text-sm font-bold text-violet-600 dark:text-violet-400">
            {formatPrice(price)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TestSharedComponentsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [userRating, setUserRating] = useState(4);
  const [customRating, setCustomRating] = useState(3.5);

  return (
    <div className="space-y-12 max-w-6xl mx-auto p-4 sm:p-6 md:p-8 pb-24">
      {/* Header */}
      <div className="border-b pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
          Bảng Thử Nghiệm UI Components Dùng Chung (Shared UI)
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Demo, tương tác và kiểm tra giao diện của các component tĩnh: Skeleton Loaders, Empty States, Star Ratings.
        </p>
      </div>

      {/* SECTION 1: SKELETON LOADERS */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 border-violet-500 pl-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">1. Skeleton Loaders (Hiệu ứng chờ tải)</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Kiểm tra hiệu ứng chờ tải (Skeleton) cho thẻ sản phẩm (Grid) và danh sách dạng bảng (Table).
            </p>
          </div>
          <Button
            onClick={() => setIsLoading(!isLoading)}
            variant="outline"
            size="sm"
            className="flex items-center gap-1.5 font-semibold text-xs rounded-lg self-start sm:self-auto shrink-0 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-violet-500" : ""}`} />
            Trạng thái: {isLoading ? "Đang tải (Skeleton)" : "Đã tải xong (Dữ liệu)"}
          </Button>
        </div>

        {/* Product Cards Grid Loader */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Lưới sản phẩm (Product Grid)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {isLoading ? (
              [...Array(4)].map((_, i) => <SkeletonProductCard key={i} />)
            ) : (
              <>
                <MockProductCard
                  name="Bàn Phím Cơ Custom Cao Cấp K87 Pro Hot-swappable Bluetooth"
                  price={1250000}
                  rating={4.8}
                  shopName="KeebsZone"
                />
                <MockProductCard
                  name="Chuột Không Dây Ergonomic Wireless Silent Click"
                  price={450000}
                  rating={4.25}
                  shopName="OfficeGear"
                />
                <MockProductCard
                  name="Tai Nghe Không Dây Noise-cancelling Over-Ear ANC"
                  price={2100000}
                  rating={4.5}
                  shopName="SoundLab"
                />
                <MockProductCard
                  name="Lót Chuột Felt Pad Felt Wool Mousepad Cao Cấp Xám Khói"
                  price={180000}
                  rating={3.9}
                  shopName="DeskSetup"
                />
              </>
            )}
          </div>
        </div>

        {/* Table Rows Loader */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Bảng dữ liệu quản trị (Table View)
          </h3>
          <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Sản phẩm / ID</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Giá bán</TableHead>
                  <TableHead className="text-right">Tồn kho</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <SkeletonTableRows rows={4} columns={4} />
                ) : (
                  <>
                    <TableRow>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <input type="checkbox" className="rounded border-zinc-300" checked disabled />
                          <span>Bàn phím cơ K87 Pro</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30">
                          Đang bán
                        </span>
                      </TableCell>
                      <TableCell>1.250.000 đ</TableCell>
                      <TableCell className="text-right font-semibold">45</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <input type="checkbox" className="rounded border-zinc-300" checked disabled />
                          <span>Chuột Ergonomic Silent</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30">
                          Đang bán
                        </span>
                      </TableCell>
                      <TableCell>450.000 đ</TableCell>
                      <TableCell className="text-right font-semibold">120</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <input type="checkbox" className="rounded border-zinc-300" checked disabled />
                          <span>Tai nghe Noise-cancelling ANC</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30">
                          Hết hàng
                        </span>
                      </TableCell>
                      <TableCell>2.100.000 đ</TableCell>
                      <TableCell className="text-right font-semibold">0</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* SECTION 2: STAR RATING */}
      <div className="space-y-6">
        <div className="border-l-4 border-violet-500 pl-4">
          <h2 className="text-xl font-bold tracking-tight">2. Star Rating (Đánh giá số sao)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Hỗ trợ hiển thị điểm số sao tĩnh (với độ chính xác đến phần thập phân lẻ) và sao động/tương tác (khi đánh giá mới).
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Static rating states */}
          <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-sm text-foreground uppercase tracking-wider flex items-center gap-2 border-b pb-2">
              <Layers className="h-4 w-4 text-violet-500" />
              <span>Chế độ Tĩnh (Static Display)</span>
            </h3>
            <div className="space-y-3.5">
              <div className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                <span className="text-xs font-medium text-muted-foreground">Sao nhỏ (sm) - rating 3.5</span>
                <StarRating rating={3.5} size="sm" showValue />
              </div>
              <div className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                <span className="text-xs font-medium text-muted-foreground">Sao trung bình (md) - rating 4.25</span>
                <StarRating rating={4.25} size="md" showValue />
              </div>
              <div className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                <span className="text-xs font-medium text-muted-foreground">Sao lớn (lg) - rating 4.75</span>
                <StarRating rating={4.75} size="lg" showValue />
              </div>
              <div className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                <span className="text-xs font-medium text-muted-foreground">Sao lớn (lg) - rating 5.0</span>
                <StarRating rating={5} size="lg" showValue />
              </div>
            </div>
            {/* Slider to test custom static ratings */}
            <div className="pt-2">
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-2">
                Kéo để kiểm thử sao lẻ tùy ý: <span className="text-violet-600 dark:text-violet-400 font-extrabold">{customRating.toFixed(2)} / 5</span>
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.05"
                  value={customRating}
                  onChange={(e) => setCustomRating(parseFloat(e.target.value))}
                  className="flex-1 accent-violet-600 cursor-pointer"
                />
                <StarRating rating={customRating} size="md" showValue />
              </div>
            </div>
          </div>

          {/* Interactive rating state */}
          <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="font-bold text-sm text-foreground uppercase tracking-wider flex items-center gap-2 border-b pb-2">
                <Star className="h-4 w-4 text-violet-500 fill-violet-500" />
                <span>Chế độ Tương Tác (Interactive Mode)</span>
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Di chuột lên các ngôi sao dưới đây để xem trước điểm đánh giá, và nhấn click để chọn số sao (thích hợp cho các Form đánh giá sản phẩm).
              </p>
              <div className="flex flex-col items-center justify-center p-6 border rounded-lg bg-zinc-50/50 dark:bg-zinc-900/10 space-y-3">
                <span className="text-xs font-bold text-zinc-500">ĐÁNH GIÁ CỦA BẠN</span>
                <StarRating
                  rating={userRating}
                  maxRating={5}
                  size="lg"
                  showValue
                  interactive
                  onChange={(r) => setUserRating(r)}
                />
                <span className="text-xs text-muted-foreground font-medium">
                  {userRating === 5 && "Tuyệt vời! Rất hài lòng. 😍"}
                  {userRating === 4 && "Khá tốt! Hài lòng. 🙂"}
                  {userRating === 3 && "Bình thường! Chấp nhận được. 😐"}
                  {userRating === 2 && "Kém! Cần cải thiện. 🙁"}
                  {userRating === 1 && "Rất tệ! Không hài lòng. 😡"}
                </span>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <Button
                variant="outline"
                size="xs"
                onClick={() => setUserRating(4)}
                className="text-xs font-medium rounded-lg"
              >
                Reset về 4 sao
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: EMPTY STATES */}
      <div className="space-y-6">
        <div className="border-l-4 border-violet-500 pl-4">
          <h2 className="text-xl font-bold tracking-tight">3. Empty States (Giao diện trống)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Hiển thị khi danh sách trống với Icon đẹp mắt và nút kêu gọi hành động (Call-To-Action).
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Preset Products */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
              Preset: EmptyProducts
            </span>
            <EmptyProducts actionHref="#" className="border border-solid bg-card dark:bg-card/50" />
          </div>

          {/* Preset Cart */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
              Preset: EmptyCart
            </span>
            <EmptyCart actionHref="#" className="border border-solid bg-card dark:bg-card/50" />
          </div>

          {/* Preset Orders */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
              Preset: EmptyOrders
            </span>
            <EmptyOrders actionHref="#" className="border border-solid bg-card dark:bg-card/50" />
          </div>
        </div>

        {/* Custom EmptyState Demonstration */}
        <div className="space-y-2 pt-4">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
            Custom Empty State (Tuỳ chỉnh tự do)
          </span>
          <div className="rounded-xl border bg-card p-6">
            <EmptyState
              icon={<Search className="w-8 h-8 text-amber-500 animate-bounce" />}
              title="Không tìm thấy kết quả tìm kiếm"
              description="Chúng tôi không tìm thấy kết quả phù hợp với từ khoá của bạn. Thử dùng từ khoá khác hoặc tạo sản phẩm yêu cầu."
              actionLabel="Tạo sản phẩm mới"
              onAction={() => alert("Đang điều hướng đến trang tạo sản phẩm...")}
              className="border-none bg-transparent max-w-2xl"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
