// Từ đồng nghĩa → slug danh mục.
//
// Khoá viết sẵn ở dạng chuẩn hoá (thường, không dấu) để so thẳng với đầu ra của
// normalizeVietnamese.
//
// Chỉ liệt kê những cụm không nằm trong tên danh mục; tên thì bảng tra tự sinh khoá. Ví dụ
// "tai nghe" thuộc nhóm "Phụ Kiện Công Nghệ" nhưng không trùng chữ nào trong tên đó.
//
// Trỏ về slug chứ không phải tên hiển thị, vì tên dễ bị sửa hơn slug.
export const CATEGORY_SYNONYMS: Record<string, string> = {
  dt: 'dien-thoai',
  smartphone: 'dien-thoai',
  iphone: 'dien-thoai',
  'dien thoai di dong': 'dien-thoai',

  'may tinh xach tay': 'laptop',
  macbook: 'laptop',
  'may tinh': 'laptop',

  'tai nghe': 'phu-kien-cong-nghe',
  sac: 'phu-kien-cong-nghe',
  'cu sac': 'phu-kien-cong-nghe',
  chuot: 'phu-kien-cong-nghe',
  'ban phim': 'phu-kien-cong-nghe',
  'phu kien': 'phu-kien-cong-nghe',

  'ao thun': 'ao-thun-nam',
  'ao phong': 'ao-thun-nam',
  ao: 'ao-thun-nam',

  giay: 'giay-the-thao',
  sneaker: 'giay-the-thao',

  'quan jean': 'quan-jean-nam',
  'quan bo': 'quan-jean-nam',
  quan: 'quan-jean-nam',
};
