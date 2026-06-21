"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Package, MapPin, Ticket, Star } from "lucide-react";

const NAV_ITEMS = [
  { href: "/profile", label: "Tài khoản", icon: User },
  { href: "/profile/orders", label: "Đơn hàng của tôi", icon: Package },
  { href: "/profile/addresses", label: "Sổ địa chỉ", icon: MapPin },
  { href: "/profile/coupons", label: "Ví voucher", icon: Ticket },
  { href: "/profile/reviews", label: "Đánh giá sản phẩm", icon: Star },
];

export function ProfileSidebar() {
  const pathname = usePathname();
  return (
    <aside className="lg:sticky lg:top-24">
      <nav className="rounded-xl border bg-card p-2 shadow-sm space-y-1">
        {NAV_ITEMS.map((item) => {
          // "/profile" là route gốc → chỉ active khi khớp tuyệt đối,
          // tránh active luôn khi đang ở /profile/orders...
          const isActive =
            item.href === "/profile"
              ? pathname === "/profile"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                isActive
                  ? "bg-violet-600/10 text-violet-600 dark:text-violet-400"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
