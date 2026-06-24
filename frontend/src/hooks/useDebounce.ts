import { useState, useEffect } from 'react';

/**
 * Custom hook giúp debounce một giá trị bất kỳ sau một khoảng thời gian trễ nhất định.
 *
 * @param value Giá trị cần trì hoãn đổi mới.
 * @param delay Thời gian trễ (mili giây), mặc định là 300ms.
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Thiết lập timer cập nhật giá trị trì hoãn
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Dọn dẹp timer nếu giá trị thay đổi trước khi hết thời gian trễ
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default useDebounce;
