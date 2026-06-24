'use client';

import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StarRatingProps {
  rating: number; // 0 đến maxRating
  maxRating?: number; // Mặc định là 5
  size?: 'sm' | 'md' | 'lg'; // Các kích thước phổ biến
  showValue?: boolean; // Hiển thị số điểm bên cạnh
  interactive?: boolean; // Cho phép di chuột và click chọn điểm đánh giá
  onChange?: (rating: number) => void; // Callback khi giá trị thay đổi
  className?: string;
}

export function StarRating({
  rating,
  maxRating = 5,
  size = 'md',
  showValue = false,
  interactive = false,
  onChange,
  className,
}: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  // Kích thước icon tương ứng
  const sizeMap = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  const iconSize = sizeMap[size];

  // Giá trị rating thực tế dùng hiển thị (tính cả trạng thái hover khi interactive)
  const displayRating =
    interactive && hoverRating !== null ? hoverRating : rating;

  const handleMouseEnter = (val: number) => {
    if (!interactive) return;
    setHoverRating(val);
  };

  const handleMouseLeave = () => {
    if (!interactive) return;
    setHoverRating(null);
  };

  const handleClick = (val: number) => {
    if (!interactive || !onChange) return;
    onChange(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!interactive || !onChange) return;

    let newRating = rating;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      newRating = Math.min(rating + 0.5, maxRating);
      onChange(newRating);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      newRating = Math.max(rating - 0.5, 0);
      onChange(newRating);
    }
  };

  // Render một ngôi sao cụ thể
  const renderStar = (starIndex: number) => {
    const starValue = starIndex + 1; // 1-indexed

    // Trạng thái sao: đầy, rỗng hay bán phần
    const isFilled = displayRating >= starValue;
    const isEmpty = displayRating <= starValue - 1;
    const isHalf = !isFilled && !isEmpty;

    const starColorClass = 'text-amber-400 fill-amber-400';
    const emptyStarColorClass =
      'text-zinc-200 dark:text-zinc-700 fill-zinc-100 dark:fill-zinc-800/40';

    return (
      <div key={starIndex} className="relative select-none">
        {/* Ngôi sao nền (trống/xám) */}
        <Star className={cn(iconSize, emptyStarColorClass)} />

        {/* Ngôi sao đầy xếp chồng lên với chiều rộng tuỳ biến */}
        {isFilled && (
          <div className="absolute top-0 left-0 h-full w-full overflow-hidden pointer-events-none">
            <Star className={cn(iconSize, starColorClass)} />
          </div>
        )}

        {isHalf && (
          <div
            className="absolute top-0 left-0 h-full overflow-hidden pointer-events-none"
            style={{
              width: `${(displayRating - (starValue - 1)) * 100}%`,
            }}
          >
            <Star className={cn(iconSize, starColorClass)} />
          </div>
        )}

        {/* Khối tương tác chia đôi ngôi sao (chỉ khi interactive=true) */}
        {interactive && (
          <>
            {/* Nửa trái (chọn starValue - 0.5) */}
            <div
              className="absolute top-0 left-0 w-1/2 h-full z-10 cursor-pointer"
              onMouseEnter={() => handleMouseEnter(starValue - 0.5)}
              onClick={() => handleClick(starValue - 0.5)}
            />
            {/* Nửa phải (chọn starValue) */}
            <div
              className="absolute top-0 right-0 w-1/2 h-full z-10 cursor-pointer"
              onMouseEnter={() => handleMouseEnter(starValue)}
              onClick={() => handleClick(starValue)}
            />
          </>
        )}
      </div>
    );
  };

  return (
    <div
      className={cn(
        'flex items-center gap-1 outline-none',
        interactive &&
          'focus-visible:ring-2 focus-visible:ring-violet-500/50 rounded-lg p-0.5',
        className,
      )}
      onMouseLeave={handleMouseLeave}
      role={interactive ? 'slider' : undefined}
      aria-label={interactive ? 'Đánh giá sản phẩm' : undefined}
      aria-valuenow={displayRating}
      aria-valuemin={0}
      aria-valuemax={maxRating}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center gap-0.5" aria-hidden="true">
        {[...Array(maxRating)].map((_, i) => renderStar(i))}
      </div>

      {showValue && (
        <span
          className={cn(
            'font-bold text-muted-foreground ml-1.5 leading-none select-none w-8 text-left tabular-nums shrink-0',
            size === 'sm' && 'text-xs',
            size === 'md' && 'text-sm',
            size === 'lg' && 'text-base',
          )}
        >
          {displayRating.toFixed(1)}
        </span>
      )}
    </div>
  );
}
export default StarRating;
