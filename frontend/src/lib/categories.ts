// Dựng chuỗi danh mục từ GỐC → LÁ cho 1 category id.
// list: danh sách danh mục PHẲNG (mỗi item có { id, name, slug, parent }), lấy từ categoriesApiRequest.getAll().
// targetId: id danh mục lá (vd product.category.id). Trả [] nếu không có/không tìm thấy.
export function buildCategoryPath(list: any[], targetId?: string) {
  if (!targetId || list.length === 0) return [];
  const map = new Map(list.map((c) => [c.id, c]));
  const path: any[] = [];
  let curr = map.get(targetId);
  while (curr) {
    path.unshift(curr);
    const parentId = curr.parent?.id || curr.parent; // parent có thể là object {id} hoặc id thô
    curr = parentId ? map.get(parentId) : null;
  }
  return path;
}
