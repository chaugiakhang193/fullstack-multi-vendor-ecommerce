// Theo dõi số lần điều hướng client-side kể từ lần load document hiện tại.
//
// Cố ý giữ ở bộ nhớ (không dùng sessionStorage) để giá trị reset sau mỗi full-load.
// Nhờ đó phân biệt được ngữ cảnh vào trang 404: full-load từ nguồn ngoài đồng nghĩa
// chưa có điều hướng nội bộ, còn điều hướng client-side thì ngược lại.
//
// window.history.length không thay thế được vì nó tính cả entry của origin ngoài,
// nên không cho biết trang liền trước có thuộc ứng dụng hay không.
let inAppNavigationCount = 0;

// Ghi nhận một lần điều hướng nội bộ; gọi khi pathname thay đổi (xem AppProvider).
export function markInAppNavigation(): void {
  inAppNavigationCount += 1;
}

// Trả về true khi đã có điều hướng nội bộ, tức router.back() sẽ dừng lại trong ứng
// dụng thay vì rời sang origin ngoài.
export function hasInAppHistory(): boolean {
  return inAppNavigationCount > 0;
}
