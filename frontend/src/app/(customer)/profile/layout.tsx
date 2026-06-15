"use client";

import { useSelectedLayoutSegments } from "next/navigation";
import { ProfileSidebar } from "@/components/profile/profile-sidebar";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  const segments = useSelectedLayoutSegments();
  // Trang detail (vd: orders/[id]) → segments có ≥ 2 phần tử → full-width, không sidebar.
  const isDetailView = segments.length >= 2;

  if (isDetailView) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-10">{children}</div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-10">
      <div className="grid lg:grid-cols-[240px_1fr] gap-6 items-start">
        <ProfileSidebar />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
