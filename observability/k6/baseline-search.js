import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import exec from 'k6/execution';

// Baseline search TRƯỚC khi có search-service (tuần 1).
// Chạy lại NGUYÊN XI script này ở tuần 4 để so trước/sau.
// Chạy:  k6 run observability/k6/baseline-search.js
//
// KHÔNG chạy kèm cờ --vus / --duration.
//   Cờ CLI KHÔNG chỉnh thêm mà XOÁ SẠCH toàn bộ `scenarios` bên dưới, thay bằng 1 scenario
//   `default` phẳng ("cli level configuration overrode scenarios configuration entirely").
//   Hậu quả: mất cả 3 mức tải 10/50/100 VU, và exec.scenario.name thành 'default' nên
//   durByLoad[...] undefined => mất luôn 3 Trend dur_10vu/50vu/100vu. Số vẫn ra, nhưng là
//   số của MỘT BÀI TEST KHÁC => so trước/sau sai.
//   Muốn đổi tải: sửa `options` bên dưới, hoặc dùng biến môi trường (k6 run -e VUS=200 ...).
//
// Kiểm tính hợp lệ của lần chạy: dòng `scenarios:` ở đầu output phải liệt kê ĐỦ 3 scenario.
//   Nếu thấy "1 iterations for each of 1 VUs" hoặc chỉ một `default` thì k6 đã không đọc được
//   `options` (sai tên export, hoặc bị cờ CLI đè) — kết quả không dùng để so sánh được.
//
// Backend chạy throttle mặc định 100 req/60s mỗi IP, nên 100 VU từ cùng một IP sẽ nhận
//   khoảng 97% HTTP 429 và phép đo thành đo rate-limiter. Nâng THROTTLE_LIMIT trong
//   backend/.env rồi khởi động lại backend trước khi đo, và trả lại giá trị cũ sau khi xong.
//   Xác nhận bằng header X-RateLimit-Limit trong response, và bằng http_req_failed = 0% trong
//   kết quả k6. Số baseline đo được nằm ở mục Observability trong README.
const BASE = __ENV.BASE_URL || 'http://localhost:8080/api/v1';

// Trend gộp + Trend tách theo mức tải, để báo cáo có một dòng riêng cho 10/50/100 VU.
const searchDuration = new Trend('search_duration', true);
const durByLoad = {
  load_10: new Trend('dur_10vu', true),
  load_50: new Trend('dur_50vu', true),
  load_100: new Trend('dur_100vu', true),
};

// 3 mức tải, chạy nối tiếp, mỗi mức 1 phút.
export const options = {
  // In sẵn p50/p95/p99 cho mọi Trend trong bảng tổng kết.
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  scenarios: {
    load_10: { executor: 'constant-vus', vus: 10, duration: '1m', startTime: '0s' },
    load_50: { executor: 'constant-vus', vus: 50, duration: '1m', startTime: '70s' },
    load_100: { executor: 'constant-vus', vus: 100, duration: '1m', startTime: '140s' },
  },
  thresholds: {
    // Không phải để pass/fail — để k6 in sẵn p95/p99 trong bảng tổng kết.
    search_duration: ['p(95)<100000'],
  },
};

// Từ khoá tiếng Việt CÓ DẤU và KHÔNG DẤU — chính là chỗ ILIKE đang thua.
const KEYWORDS = ['áo', 'ao', 'điện thoại', 'dien thoai', 'giày', 'giay', 'quần'];

export default function () {
  const q = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
  const res = http.get(`${BASE}/products?q=${encodeURIComponent(q)}&page=1&limit=20`);

  searchDuration.add(res.timings.duration);
  const t = durByLoad[exec.scenario.name];
  if (t) t.add(res.timings.duration);
  check(res, {
    'status 200': (r) => r.status === 200,
    'có body': (r) => r.body.length > 0,
  });
  sleep(1);
}
