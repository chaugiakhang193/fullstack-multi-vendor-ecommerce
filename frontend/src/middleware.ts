import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Danh sách các đường dẫn chỉ dành cho KHÁCH (chưa đăng nhập)
const guestOnlyPaths = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Kiểm tra xem trình duyệt có các cookie cần thiết không
  const hasToken = request.cookies.has("refresh_token");
  const userRole = request.cookies.get("user_role")?.value;
  const userStatus = request.cookies.get("user_status")?.value;

  // Nếu ĐÃ CÓ token và thông tin vai trò hợp lệ VÀ đang cố truy cập vào các trang của Khách (/login, /register)
  if (hasToken && userRole && guestOnlyPaths.includes(pathname)) {
    // Chuyển hướng người dùng về trang chủ
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Chặn nghiêm ngặt: Vào admin hoặc seller nhưng KHÔNG có refresh_token HOẶC KHÔNG có user_role -> Đá ra trang login
  if (
    (!hasToken || !userRole) &&
    (pathname.startsWith("/admin") || pathname.startsWith("/seller"))
  ) {
    const redirectPath = encodeURIComponent(pathname + request.nextUrl.search);
    return NextResponse.redirect(
      new URL(`/login?redirect=${redirectPath}`, request.url),
    );
  }

  // Phân quyền khi CÓ thông tin cookie phụ:
  if (hasToken && userRole) {
    // Bảo vệ trang Admin
    if (pathname.startsWith("/admin")) {
      if (userRole === "seller") {
        return NextResponse.redirect(new URL("/seller", request.url));
      }
      if (userRole !== "admin") {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }

    // Bảo vệ trang Seller
    if (pathname.startsWith("/seller")) {
      if (userRole === "admin") {
        return NextResponse.redirect(new URL("/admin", request.url));
      }
      if (userRole !== "seller") {
        return NextResponse.redirect(new URL("/register-seller", request.url));
      }
      // Nếu là seller nhưng đang chờ duyệt thì chỉ cho phép vào /seller/pending
      if (userStatus === "pending_approval" && pathname !== "/seller/pending") {
        return NextResponse.redirect(new URL("/seller/pending", request.url));
      }
    }
  }

  // Nếu không vi phạm gì, cho phép request đi tiếp bình thường
  return NextResponse.next();
}

// Middleware chỉ chạy trên các route này
export const config = {
  matcher: ["/login", "/register", "/admin/:path*", "/seller/:path*"],
};
