import { formatEdgeHeaders } from './edge-headers.helper';

describe('formatEdgeHeaders', () => {
  it('trả về chuỗi rỗng khi không có header edge nào', () => {
    const headers = new Headers({
      'content-type': 'application/json',
      server: 'cloudflare',
    });
    const result = formatEdgeHeaders(headers);
    expect(result).toBe('');
  });

  it('trả về đúng một cặp khi chỉ có một header edge xuất hiện', () => {
    const headers = new Headers({
      'retry-after': '60',
    });
    const result = formatEdgeHeaders(headers);
    expect(result).toBe(' [edge retry-after=60]');
  });

  it('trả về đầy đủ theo đúng thứ tự khai báo khi có đủ ba header edge', () => {
    // Đầu vào cố tình xáo thứ tự để chứng minh output bám EDGE_HEADER_NAMES, chứ không bám
    // thứ tự header nhận được.
    const headers = new Headers({
      'x-render-routing': 'srv-abc123',
      'cf-ray': '8bd1234567890-SGN',
      'retry-after': '120',
    });
    const result = formatEdgeHeaders(headers);
    expect(result).toBe(
      ' [edge retry-after=120 cf-ray=8bd1234567890-SGN x-render-routing=srv-abc123]',
    );
  });
});
