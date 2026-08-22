'use client';

import React from 'react';

// Bắt http/https tới khoảng trắng gần nhất. Cố tình đơn giản: system prompt của bot cấm
// markdown và bắt kèm đường dẫn lấy từ trường url của kết quả tìm kiếm, nên link luôn đứng
// trần giữa câu chứ không nằm trong cú pháp [chữ](url).
const URL_PATTERN = /(https?:\/\/[^\s<>()"']+)/g;

// Cắt dấu câu dính đuôi: trong "xem tại https://shop.vn/p/abc." thì dấu chấm là của câu văn,
// không thuộc đường dẫn.
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

// Render văn bản thuần, chỉ biến URL thành thẻ <a>.
//
// KHÔNG dùng dangerouslySetInnerHTML: mọi mảnh chữ ở đây do model sinh ra từ tên sản phẩm mà
// seller tự nhập, tức là dữ liệu người ngoài viết. Cắt chuỗi rồi để React tự escape thì không
// còn đường nào chèn thẻ HTML vào.
//
// Nhận CHUỖI ĐÃ GỘP chứ không phải từng mảnh SSE: một đường dẫn hoàn toàn có thể bị cắt đôi
// giữa hai mảnh, linkify trên từng mảnh là ra hai nửa link chết.
export function MessageText({ text }: { text: string }) {
  // split với regex có nhóm bắt: phần khớp nằm ở các chỉ số lẻ.
  const parts = text.split(URL_PATTERN);

  return (
    <p className="text-sm break-words whitespace-pre-wrap">
      {parts.map((part, index) => {
        const isUrl = index % 2 === 1;
        if (!isUrl) return <React.Fragment key={index}>{part}</React.Fragment>;

        const href = part.replace(TRAILING_PUNCTUATION, '');
        const tail = part.slice(href.length);

        return (
          <React.Fragment key={index}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:opacity-80"
            >
              {href}
            </a>
            {tail}
          </React.Fragment>
        );
      })}
    </p>
  );
}
