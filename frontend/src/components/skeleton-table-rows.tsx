import React from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface SkeletonTableRowsProps {
  rows?: number;
  columns?: number;
}

export default function SkeletonTableRows({
  rows = 5,
  columns = 4,
}: SkeletonTableRowsProps) {
  // Tập hợp các class độ rộng để giả lập độ dài khác nhau của dữ liệu thật
  const widthClasses = [
    "w-12",
    "w-20",
    "w-28",
    "w-36",
    "w-16",
    "w-24",
    "w-32",
    "w-44",
  ];

  return (
    <>
      {[...Array(rows)].map((_, rowIndex) => (
        <TableRow key={rowIndex} className="animate-pulse">
          {[...Array(columns)].map((_, colIndex) => {
            // Sử dụng thuật toán tuần tuần tự dựa trên index để tránh hydration mismatch (lỗi SSR)
            const widthIndex = (rowIndex * 3 + colIndex * 2) % widthClasses.length;
            const widthClass = widthClasses[widthIndex];

            return (
              <TableCell key={colIndex}>
                {colIndex === 0 ? (
                  // Cột đầu thường là Checkbox hoặc Icon hoặc ID ngắn
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-4 w-4 shrink-0 rounded" />
                    <Skeleton className={`h-4 ${widthClass}`} />
                  </div>
                ) : (
                  <Skeleton className={`h-4 ${widthClass}`} />
                )}
              </TableCell>
            );
          })}
        </TableRow>
      ))}
    </>
  );
}
