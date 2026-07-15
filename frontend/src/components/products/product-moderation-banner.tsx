import { ShieldAlert } from 'lucide-react';

// Banner cảnh báo seller sản phẩm đang bị gỡ (suspended). Hiển thị lý do nếu có.
// Seller không tự khôi phục được — chỉ liên hệ hỗ trợ.
export function ProductModerationBanner({
  reason,
}: {
  reason?: string | null;
}) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-start gap-3 dark:border-rose-950 dark:bg-rose-950/20">
      <div className="p-2 rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400 shrink-0">
        <ShieldAlert className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-rose-700 dark:text-rose-300">
          Sản phẩm đang bị gỡ khỏi sàn
        </p>
        <p className="text-sm text-rose-600/90 dark:text-rose-400/90">
          Sản phẩm này đã bị quản trị viên gỡ do vi phạm chính sách và hiện
          không hiển thị với người mua. Bạn không thể chỉnh sửa cho tới khi được
          khôi phục. Vui lòng liên hệ hỗ trợ nếu cần.
        </p>
        {reason && (
          <p className="text-sm italic text-rose-700 dark:text-rose-300">
            Lý do: {reason}
          </p>
        )}
      </div>
    </div>
  );
}
