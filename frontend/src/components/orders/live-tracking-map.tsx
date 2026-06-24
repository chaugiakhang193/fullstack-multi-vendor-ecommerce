interface LiveTrackingMapProps {
  // id duy nhất (dùng cho <mpath href>) — tránh đụng giữa nhiều sub-order trên cùng trang.
  id: string;
  originLabel?: string;
  destinationLabel?: string;
  // Tọa độ optional (string từ decimal hoặc number). Đủ cả 2 đầu mới hiện nhãn khoảng cách.
  shopLat?: string | number | null;
  shopLng?: string | number | null;
  userLat?: string | number | null;
  userLng?: string | number | null;
}

function toNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function LiveTrackingMap({
  id,
  originLabel = 'Cửa hàng',
  destinationLabel = 'Nơi nhận',
  shopLat,
  shopLng,
  userLat,
  userLng,
}: LiveTrackingMapProps) {
  const pathId = `route-${id}`;
  const sLat = toNum(shopLat);
  const sLng = toNum(shopLng);
  const uLat = toNum(userLat);
  const uLng = toNum(userLng);
  const hasBoth =
    sLat !== null && sLng !== null && uLat !== null && uLng !== null;
  const distanceLabel = hasBoth
    ? `Khoảng ${haversineKm(sLat as number, sLng as number, uLat as number, uLng as number).toFixed(1)} km`
    : null;

  // Đường cong cố định (stylized) — animateMotion chạy shipper dọc path này.
  const routeD = 'M 44 110 Q 200 24 356 110';

  return (
    <div className="rounded-xl border bg-gradient-to-b from-sky-50 to-emerald-50/40 dark:from-sky-950/20 dark:to-emerald-950/10 p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-sky-700 dark:text-sky-300 flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500" />
          </span>
          Đang giao hàng
        </span>
        {distanceLabel && (
          <span className="text-[11px] font-semibold text-muted-foreground">
            {distanceLabel}
          </span>
        )}
      </div>

      <svg
        viewBox="0 0 400 140"
        className="w-full h-auto"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Route */}
        <path
          id={pathId}
          d={routeD}
          fill="none"
          className="stroke-sky-400/70 dark:stroke-sky-600"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="2 10"
        />

        {/* Origin pin (shop) */}
        <circle cx="44" cy="110" r="11" className="fill-violet-600" />
        <circle cx="44" cy="110" r="4" className="fill-white" />

        {/* Destination pin (home) */}
        <circle cx="356" cy="110" r="11" className="fill-emerald-600" />
        <circle cx="356" cy="110" r="4" className="fill-white" />

        {/* Shipper di chuyển dọc route bằng SMIL — không cần framer-motion */}
        <g>
          <animateMotion dur="3.2s" repeatCount="indefinite" calcMode="linear">
            <mpath href={`#${pathId}`} />
          </animateMotion>
          {/* bong bóng nền */}
          <circle r="13" fill="white" stroke="#f59e0b" strokeWidth="2" />
          {/* xe tải đơn giản, tâm tại (0,0) */}
          <rect x="-7" y="-4" width="9" height="6" rx="1" fill="#f59e0b" />
          <rect x="2" y="-2" width="4" height="4" rx="1" fill="#f59e0b" />
          <circle cx="-4" cy="3" r="1.7" fill="#27272a" />
          <circle cx="3" cy="3" r="1.7" fill="#27272a" />
        </g>
      </svg>

      <div className="flex items-center justify-between text-[11px] font-semibold">
        <span className="text-violet-700 dark:text-violet-300 truncate max-w-[45%]">
          {originLabel}
        </span>
        <span className="text-emerald-700 dark:text-emerald-300 truncate max-w-[45%] text-right">
          {destinationLabel}
        </span>
      </div>
    </div>
  );
}
