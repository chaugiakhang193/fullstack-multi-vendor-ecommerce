"use client";

// Libraries
import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Utilities
import { cn } from "@/lib/utils";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
}

// Helper sinh dải trang (Range Generator)
function getPaginationRange(
  currentPage: number,
  totalPages: number,
  siblingCount: number = 1
) {
  const totalPageNumbers = siblingCount * 2 + 5;

  // Trường hợp 1: Nếu tổng số trang nhỏ hơn hoặc bằng số nút tối đa cần hiển thị
  if (totalPages <= totalPageNumbers) {
    const rangeArray = [];
    for (let i = 1; i <= totalPages; i++) {
      rangeArray.push(i);
    }
    return rangeArray;
  }

  // Tính toán vị trí của sibling trái và phải
  const maxBoundary = 1;
  const calculatedLeft = currentPage - siblingCount;
  const leftSiblingIndex = Math.max(calculatedLeft, maxBoundary);

  const minBoundary = totalPages;
  const calculatedRight = currentPage + siblingCount;
  const rightSiblingIndex = Math.min(calculatedRight, minBoundary);

  // Xác định xem có hiển thị dấu ba chấm trái/phải không
  const leftDotsThreshold = 2;
  const shouldShowLeftDots = leftSiblingIndex > leftDotsThreshold;

  const rightDotsThreshold = totalPages - 2;
  const shouldShowRightDots = rightSiblingIndex < rightDotsThreshold;

  const firstPageIndex = 1;
  const lastPageIndex = totalPages;

  // Trường hợp 2: Chỉ hiển thị dấu ba chấm bên phải
  if (!shouldShowLeftDots && shouldShowRightDots) {
    const leftItemCount = 3 + 2 * siblingCount;
    const leftRange = [];
    for (let i = 1; i <= leftItemCount; i++) {
      leftRange.push(i);
    }
    const rightEllipsis = "...";
    return [...leftRange, rightEllipsis, lastPageIndex];
  }

  // Trường hợp 3: Chỉ hiển thị dấu ba chấm bên trái
  if (shouldShowLeftDots && !shouldShowRightDots) {
    const rightItemCount = 3 + 2 * siblingCount;
    const rightRange = [];
    for (let i = totalPages - rightItemCount + 1; i <= totalPages; i++) {
      rightRange.push(i);
    }
    const leftEllipsis = "...";
    return [firstPageIndex, leftEllipsis, ...rightRange];
  }

  // Trường hợp 4: Hiển thị cả dấu ba chấm bên trái và bên phải
  if (shouldShowLeftDots && shouldShowRightDots) {
    const middleRange = [];
    for (let i = leftSiblingIndex; i <= rightSiblingIndex; i++) {
      middleRange.push(i);
    }
    const leftEllipsis = "...";
    const rightEllipsis = "...";
    return [firstPageIndex, leftEllipsis, ...middleRange, rightEllipsis, lastPageIndex];
  }

  return [];
}

export function Pagination(props: PaginationProps) {
  const { currentPage, totalPages, onPageChange, siblingCount = 1 } = props;

  // Không hiển thị thanh phân trang nếu không có trang nào hoặc chỉ có 1 trang
  if (totalPages <= 1) {
    return null;
  }

  // Memoize dải trang dựa trên các biến phụ thuộc
  const paginationRange = React.useMemo(
    () => getPaginationRange(currentPage, totalPages, siblingCount),
    [currentPage, totalPages, siblingCount]
  );

  // Điều hướng trang trước
  const handlePrev = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  // Điều hướng trang sau
  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  // Phân định trạng thái nút
  const isFirstPage = currentPage === 1;
  const isLastPage = currentPage === totalPages;

  // Cấu hình CSS cho các nút
  const baseBtnStyles = "flex items-center justify-center text-xs font-semibold rounded-lg transition-all duration-150 border cursor-pointer select-none focus:outline-none";
  const activeStyles = "border-transparent bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/20";
  const inactiveStyles = "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900";
  const disabledStyles = "opacity-50 cursor-not-allowed pointer-events-none bg-zinc-100 border-zinc-200 text-zinc-400 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-600";

  // Tạo class name sử dụng helper cn
  const prevButtonClass = cn(baseBtnStyles, "px-3 h-9", isFirstPage ? disabledStyles : inactiveStyles);
  const nextButtonClass = cn(baseBtnStyles, "px-3 h-9", isLastPage ? disabledStyles : inactiveStyles);
  const dotsClass = "flex items-center justify-center h-9 w-9 text-xs font-semibold text-zinc-400 dark:text-zinc-600 select-none";

  return (
    <nav className="flex items-center justify-center space-x-2 py-6 animate-fade-in" aria-label="Phân trang">
      {/* Nút Trước */}
      <button
        onClick={handlePrev}
        disabled={isFirstPage}
        className={prevButtonClass}
      >
        <ChevronLeft className="h-4 w-4 mr-1.5" />
        <span>Trước</span>
      </button>

      {/* Danh sách trang (Chỉ hiển thị trên Desktop) */}
      <div className="hidden sm:flex items-center space-x-1.5">
        {paginationRange.map((pageItem, index) => {
          if (pageItem === "...") {
            const dotsKey = `dots-${index}`;
            return (
              <span key={dotsKey} className={dotsClass}>
                ...
              </span>
            );
          }

          const pageNumber = Number(pageItem);
          const isActive = pageNumber === currentPage;
          const buttonClass = cn(baseBtnStyles, "h-9 w-9", isActive ? activeStyles : inactiveStyles);
          const buttonKey = `page-${pageNumber}`;

          return (
            <button
              key={buttonKey}
              onClick={() => onPageChange(pageNumber)}
              className={buttonClass}
            >
              {pageNumber}
            </button>
          );
        })}
      </div>

      {/* Nhãn hiển thị trang hiện tại trên Mobile */}
      <span className="sm:hidden text-xs font-bold text-zinc-700 dark:text-zinc-300">
        Trang {currentPage} / {totalPages}
      </span>

      {/* Nút Sau */}
      <button
        onClick={handleNext}
        disabled={isLastPage}
        className={nextButtonClass}
      >
        <span>Sau</span>
        <ChevronRight className="h-4 w-4 ml-1.5" />
      </button>
    </nav>
  );
}
