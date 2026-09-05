// Header do edge (Cloudflare / Render) gắn, không phải do service của mình đặt. Đọc để
// biết CÁI GÌ chặn request service→service và chặn bao lâu — một phản hồi 429 trần không
// tự nói được nó bị chặn ở đâu và bị chặn tới bao giờ.
const EDGE_HEADER_NAMES = ['retry-after', 'cf-ray', 'x-render-routing'];

/**
 * Gom các header edge có mặt thành hậu tố gắn vào cuối dòng log.
 *
 * Không có header nào thì trả chuỗi rỗng, để dòng log giữ nguyên hình dạng cũ — hầu hết
 * phản hồi lỗi không đi qua edge nên in `retry-after=null` mỗi dòng chỉ làm bẩn log.
 */
export const formatEdgeHeaders = (headers: Headers): string => {
  const present = EDGE_HEADER_NAMES.map((name) => {
    const value = headers.get(name);
    return value ? `${name}=${value}` : null;
  }).filter((entry): entry is string => entry !== null);

  if (present.length === 0) {
    return '';
  }
  return ` [edge ${present.join(' ')}]`;
};
