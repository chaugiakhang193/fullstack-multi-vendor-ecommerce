'use client';

import { useCategories } from '@/hooks/useCategories';
import { leafCategories } from '@/lib/chat/category-match';
import type { CategoryResponseType } from '@/schemaValidations/products/categories.schema';

interface ChatCategoryChipsProps {
  heading: string;
  disabled: boolean;
  onPick: (categoryName: string) => void;
}

// Hàng chip danh mục.
//
// Bấm chip không gọi API riêng. Nó gửi tên danh mục vào ô chat đúng như người dùng tự gõ, rồi để
// luồng xử lý chung lo phần còn lại — nhờ vậy hai cách vào không thể cho ra kết quả khác nhau.
//
// Thứ tự lấy nguyên theo API trả về chứ không sắp theo display_order, vì cột đó đang NULL toàn
// bộ trong DB.
export function ChatCategoryChips({
  heading,
  disabled,
  onPick,
}: ChatCategoryChipsProps) {
  const { data } = useCategories();
  const categories = leafCategories(data?.data ?? []);

  // Chưa có danh mục — đang tải, hoặc API lỗi. Bỏ qua cả tiêu đề, không để lại một dòng chữ mời
  // chọn mà bên dưới không có nút nào.
  if (categories.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">{heading}</p>
      <div className="flex flex-wrap gap-1.5">
        {categories.map((category: CategoryResponseType) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onPick(category.name)}
            disabled={disabled}
            className="rounded-full border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            {category.name}
          </button>
        ))}
      </div>
    </div>
  );
}
