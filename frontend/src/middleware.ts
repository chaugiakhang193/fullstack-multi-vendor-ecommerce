import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Danh sách các đường dẫn chỉ dành cho KHÁCH (chưa đăng nhập)
const guestOnlyPaths = ["/login", "/register"];

export type SellerTypeStatus =
  | "NEW_SELLER"
  | "PENDING_APPROVAL"
  | "REJECTED"
  | "APPROVED";

export const SELLER_PERMISSIONS: Record<
  SellerTypeStatus,
  { allowedExact: string[]; allowedPrefixes: string[] }
> = {
  // Loại 1: Chưa đăng ký shop bao giờ -> Chỉ được xem form setup
  NEW_SELLER: {
    allowedExact: ["/seller/setup"],
    allowedPrefixes: [],
  },

  // Loại 2: Đang chờ duyệt -> Chỉ được xem trang thông báo pending
  PENDING_APPROVAL: {
    allowedExact: ["/seller/pending"],
    allowedPrefixes: [],
  },

  // Loại 3: Bị từ chối -> Được xem trang thông báo bị từ chối VÀ trang sửa thông tin shop gởi lại duyệt
  REJECTED: {
    allowedExact: ["/seller/rejected"],
    allowedPrefixes: ["/seller/setup"], // Cho phép quay lại form setup để sửa thông tin và gửi lại duyệt
  },

  // Loại 4: Đã đồng ý -> Được xem toàn bộ hệ thống Dashboard quản lý sản phẩm, đơn hàng...
  APPROVED: {
    allowedExact: ["/seller"],
    allowedPrefixes: [
      "/seller/products",
      "/seller/orders",
      "/seller/settings",
      "/seller/analytics",
      // Tuyệt đối không có /seller/pending hay /seller/rejected ở đây!
    ],
  },
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Kiểm tra xem trình duyệt có các cookie cần thiết không
  const hasToken = request.cookies.has("refresh_token");
  const userRole = request.cookies.get("user_role")?.value;
  const userStatus = request.cookies.get("user_status")?.value;

  // Nếu ĐÃ CÓ token và thông tin vai trò hợp lệ VÀ đang cố truy cập vào các trang của Khách (/login, /register)
  if (hasToken && userRole && guestOnlyPaths.includes(pathname)) {
    if (userRole === "seller") {
      return NextResponse.redirect(new URL("/seller", request.url));
    }
    if (userRole === "admin") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
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

      // Kiểm soát đường dẫn dựa trên trạng thái của Seller (State-to-Allowed-Routes Mapping)
      const statusMap: Record<string, SellerTypeStatus> = {
        new_seller: "NEW_SELLER",
        pending_approval: "PENDING_APPROVAL",
        rejected: "REJECTED",
        active: "APPROVED",
      };

      const rawStatus = userStatus || "new_seller";
      const status = statusMap[rawStatus] || "NEW_SELLER";
      const permissions = SELLER_PERMISSIONS[status];

      if (permissions) {
        const isAllowedExact = permissions.allowedExact.includes(pathname);
        const isAllowedPrefix = permissions.allowedPrefixes.some((prefix) =>
          pathname.startsWith(prefix),
        );

        if (!isAllowedExact && !isAllowedPrefix) {
          // Bị từ chối truy cập đường dẫn hiện tại -> Chuyển hướng về "vùng an toàn" tương ứng
          if (status === "PENDING_APPROVAL") {
            return NextResponse.redirect(
              new URL("/seller/pending", request.url),
            );
          }
          if (status === "APPROVED") {
            return NextResponse.redirect(new URL("/seller", request.url));
          }
          if (status === "REJECTED") {
            return NextResponse.redirect(
              new URL("/seller/rejected", request.url),
            );
          }
          // NEW_SELLER quay về /seller/setup
          return NextResponse.redirect(new URL("/seller/setup", request.url));
        }
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
