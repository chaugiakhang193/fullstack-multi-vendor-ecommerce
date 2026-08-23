import { CATEGORY_SYNONYMS } from '@/constants/category-synonyms';
import { normalizeVietnamese } from '@/lib/chat/normalize';
import type { CategoryResponseType } from '@/schemaValidations/products/categories.schema';

export interface MatchedCategory {
  id: string;
  name: string;
}

// Danh mục lá = có cha.
//
// Chỉ lá mới lên chip. Danh mục gốc vẫn tra được vì BE gộp cả danh mục con, nhưng khi đó cần hai
// lần bấm cho cùng một kết quả.
//
// API trả `parent` lúc là object lúc là id, giống cách trang /products dựng cây.
export function leafCategories(
  categories: CategoryResponseType[],
): CategoryResponseType[] {
  return categories.filter((category) => {
    const parent = category.parent as
      | { id?: string }
      | string
      | null
      | undefined;
    return parent !== null && parent !== undefined && parent !== '';
  });
}

// Dựng bảng tra: chuỗi đã chuẩn hoá → danh mục.
//
// Khoá đến từ hai nguồn. Tên và slug danh mục sinh tự động, nên thêm danh mục mới không phải sửa
// code. Bảng đồng nghĩa là phần viết tay, chỉ cho những cụm không nằm trong tên.
function buildLookup(
  categories: CategoryResponseType[],
): Map<string, MatchedCategory> {
  const bySlug = new Map<string, MatchedCategory>();
  for (const category of categories) {
    bySlug.set(category.slug, { id: category.id, name: category.name });
  }

  const lookup = new Map<string, MatchedCategory>();
  for (const category of categories) {
    const entry = { id: category.id, name: category.name };
    lookup.set(normalizeVietnamese(category.name), entry);
    lookup.set(normalizeVietnamese(category.slug.replace(/-/g, ' ')), entry);
  }

  for (const [phrase, slug] of Object.entries(CATEGORY_SYNONYMS)) {
    const target = bySlug.get(slug);
    // Slug này không có trên sàn hiện tại. Bảng đồng nghĩa cố định trong code còn danh mục khác
    // nhau theo môi trường, nên lệch nhau không phải lỗi.
    if (!target) continue;
    // Tên danh mục thật được ưu tiên hơn từ đồng nghĩa.
    if (lookup.has(phrase)) continue;
    lookup.set(phrase, target);
  }

  return lookup;
}

// Tìm danh mục khớp với cả câu.
//
// So khớp toàn bộ câu chứ không phải chuỗi con. "dien thoai nao chup anh dep" có chứa tên một
// danh mục, nhưng đó là câu hỏi tư vấn và bot trả lời nó tốt hơn nhiều: bot trích được cả từ
// khoá lẫn khoảng giá rồi mới gọi tool, còn phím tắt chỉ lọc theo đúng một danh mục.
//
// Độ dài câu là thứ phân biệt hai ý định đó. Gõ đúng một cụm danh mục nghĩa là đang duyệt; gõ
// cả câu nghĩa là đang hỏi.
export function matchCategory(
  question: string,
  categories: CategoryResponseType[],
): MatchedCategory | null {
  const normalized = normalizeVietnamese(question);
  if (normalized === '') return null;

  return buildLookup(categories).get(normalized) ?? null;
}
