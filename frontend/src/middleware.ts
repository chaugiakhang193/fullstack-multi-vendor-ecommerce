import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { GUEST_ONLY_PATHS } from '@/constants/routes';
import { UserRole, AccountStatus } from '@/constants/enum';

// Danh sách các đường dẫn chỉ dành cho KHÁCH (chưa đăng nhập)
const guestOnlyPaths: readonly string[] = GUEST_ONLY_PATHS;

export type SellerTypeStatus =
  | 'NEW_SELLER'
  | 'PENDING_APPROVAL'
  | 'REJECTED'
  | 'APPROVED';

export const SELLER_PERMISSIONS: Record<
  SellerTypeStatus,
  { allowedExact: string[]; allowedPrefixes: string[] }
> = {
  // Loại 1: Chưa đăng ký shop bao giờ -> Chỉ được xem form setup
  NEW_SELLER: {
    allowedExact: ['/seller/setup'],
    allowedPrefixes: [],
  },

  // Loại 2: Đang chờ duyệt -> Chỉ được xem trang thông báo pending
  PENDING_APPROVAL: {
    allowedExact: ['/seller/pending'],
    allowedPrefixes: [],
  },

  // Loại 3: Bị từ chối -> Được xem trang thông báo bị từ chối VÀ trang sửa thông tin shop gởi lại duyệt
  REJECTED: {
    allowedExact: ['/seller/rejected'],
    allowedPrefixes: ['/seller/setup'], // Cho phép quay lại form setup để sửa thông tin và gửi lại duyệt
  },

  // Loại 4: Đã đồng ý -> Được xem toàn bộ hệ thống Dashboard quản lý sản phẩm, đơn hàng...
  APPROVED: {
    allowedExact: ['/seller'],
    allowedPrefixes: [
      '/seller/products',
      '/seller/orders',
      '/seller/settings',
      '/seller/analytics',
      '/seller/coupons',
      '/seller/reviews',
      '/seller/payouts',
      '/seller/returns',
      '/seller/messages',
      // Tuyệt đối không có /seller/pending hay /seller/rejected ở đây!
    ],
  },
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Deploy cross-domain (BE Render ≠ FE Vercel): refresh_token là cookie httpOnly của
  // domain BE → middleware chạy trên domain FE KHÔNG đọc được. Dùng cookie user_role
  // (FE tự set trên domain FE, xem useAuthStore) làm tín hiệu "đã đăng nhập" để gate
  // route điều hướng. Bảo mật thật vẫn do JWT guard ở BE lo trên mọi API call.
  // (Local same-site cũng hoạt động vì FE set cookie này ở cả hai môi trường.)
  const hasToken = request.cookies.has('user_role');
  const userRole = request.cookies.get('user_role')?.value;
  const userStatus = request.cookies.get('user_status')?.value;

  // Nếu ĐÃ CÓ token và thông tin vai trò hợp lệ VÀ đang cố truy cập vào các trang của Khách (/login, /register)
  if (hasToken && userRole && guestOnlyPaths.includes(pathname)) {
    if (userRole === UserRole.SELLER) {
      return NextResponse.redirect(new URL('/seller', request.url));
    }
    if (userRole === UserRole.ADMIN) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
    // Chuyển hướng người dùng về trang chủ
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Chặn nghiêm ngặt: Vào admin hoặc seller nhưng KHÔNG có refresh_token HOẶC KHÔNG có user_role -> Đá ra trang login
  if (
    (!hasToken || !userRole) &&
    (pathname.startsWith('/admin') || pathname.startsWith('/seller'))
  ) {
    const redirectPath = encodeURIComponent(pathname + request.nextUrl.search);
    return NextResponse.redirect(
      new URL(`/login?redirect=${redirectPath}`, request.url),
    );
  }

  // Phân quyền khi CÓ thông tin cookie phụ:
  if (hasToken && userRole) {
    // Bảo vệ trang Admin
    if (pathname.startsWith('/admin')) {
      if (userRole === UserRole.SELLER) {
        return NextResponse.redirect(new URL('/seller', request.url));
      }
      if (userRole !== UserRole.ADMIN) {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }

    // Bảo vệ trang Seller
    if (pathname.startsWith('/seller')) {
      if (userRole === UserRole.ADMIN) {
        return NextResponse.redirect(new URL('/admin', request.url));
      }
      if (userRole !== UserRole.SELLER) {
        return NextResponse.redirect(new URL('/register-seller', request.url));
      }

      // Kiểm soát đường dẫn dựa trên trạng thái của Seller (State-to-Allowed-Routes Mapping)
      const statusMap: Record<string, SellerTypeStatus> = {
        [AccountStatus.NEW_SELLER]: 'NEW_SELLER',
        [AccountStatus.PENDING_APPROVAL]: 'PENDING_APPROVAL',
        [AccountStatus.REJECTED]: 'REJECTED',
        [AccountStatus.ACTIVE]: 'APPROVED',
      };

      const rawStatus = userStatus || AccountStatus.NEW_SELLER;
      const status = statusMap[rawStatus] || 'NEW_SELLER';
      const permissions = SELLER_PERMISSIONS[status];

      if (permissions) {
        const isAllowedExact = permissions.allowedExact.includes(pathname);
        const isAllowedPrefix = permissions.allowedPrefixes.some((prefix) =>
          pathname.startsWith(prefix),
        );

        if (!isAllowedExact && !isAllowedPrefix) {
          // Bị từ chối truy cập đường dẫn hiện tại -> Chuyển hướng về "vùng an toàn" tương ứng
          if (status === 'PENDING_APPROVAL') {
            return NextResponse.redirect(
              new URL('/seller/pending', request.url),
            );
          }
          if (status === 'APPROVED') {
            return NextResponse.redirect(new URL('/seller', request.url));
          }
          if (status === 'REJECTED') {
            return NextResponse.redirect(
              new URL('/seller/rejected', request.url),
            );
          }
          // NEW_SELLER quay về /seller/setup
          return NextResponse.redirect(new URL('/seller/setup', request.url));
        }
      }
    }
  }

  // Nếu không vi phạm gì, cho phép request đi tiếp bình thường
  return NextResponse.next();
}

// Middleware chỉ chạy trên các route này
export const config = {
  matcher: ['/login', '/register', '/admin/:path*', '/seller/:path*'],
};
