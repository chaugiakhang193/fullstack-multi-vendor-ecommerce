// Tiện ích quyết định nút "Quay lại" ở trang 404 nên gọi router.back() hay về trang
// chủ, sao cho không bao giờ rời khỏi ứng dụng sang một origin ngoài.

// Phần Navigation API chỉ tồn tại trên Chromium; khai báo tối thiểu để dùng có kiểu
// mà không phụ thuộc lib.dom bản mới.
interface NavigationHistoryEntryLike {
  url: string | null;
  index: number;
}
interface NavigationLike {
  currentEntry: NavigationHistoryEntryLike | null;
  entries(): NavigationHistoryEntryLike[];
}

// Theo dõi số lần điều hướng client-side kể từ lần load document hiện tại. Cố ý giữ ở
// bộ nhớ (không dùng sessionStorage) để giá trị reset sau mỗi full-load, dùng làm phương
// án dự phòng khi Navigation API không khả dụng.
let inAppNavigationCount = 0;

// Ghi nhận một lần điều hướng nội bộ; gọi khi pathname thay đổi (xem AppProvider).
export function markInAppNavigation(): void {
  inAppNavigationCount += 1;
}

// Cho biết router.back() sẽ dừng lại trong ứng dụng thay vì rời sang origin ngoài.
//
// Ưu tiên Navigation API vì nó đọc được origin của entry liền trước — kể cả khi vào
// 404 bằng full-load do gõ URL, trường hợp mà referrer rỗng và bộ đếm đã bị reset.
// Nếu trình duyệt không hỗ trợ, suy ra từ số điều hướng client-side đã ghi nhận: cách
// này bỏ sót ca gõ URL trực tiếp từ một trang nội bộ, nhưng luôn nghiêng về an toàn.
export function canGoBackInApp(): boolean {
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  const index = nav?.currentEntry?.index;

  if (nav && typeof index === 'number') {
    if (index <= 0) return false;
    const previous = nav.entries()[index - 1];
    if (!previous || !previous.url) return false;
    return new URL(previous.url).origin === window.location.origin;
  }

  return inAppNavigationCount > 0;
}
