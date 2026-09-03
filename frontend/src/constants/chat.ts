// Tên các event SSE mà chat-service nhả ra. Phải khớp nguyên văn với hằng số trong
// chat-service/internal/httpapi/sse.go — lệch một chữ thì FE im lặng bỏ qua cả stream mà
// không sinh lỗi nào để lần ra.
export const CHAT_EVENTS = {
  META: 'meta',
  TOOL: 'tool',
  TEXT: 'text',
  DONE: 'done',
  ERROR: 'error',
} as const;

// Khoá localStorage giữ định danh khách vãng lai.
export const GUEST_KEY_STORAGE = 'chat_guest_key';

// Đồng bộ với maxQuestionRunes bên chat-service. Chặn ở FE để người dùng thấy ngay, BE vẫn
// chặn lại lần nữa vì không có lý do gì tin FE.
export const MAX_QUESTION_LENGTH = 1000;

// Sáu lý do 429 cần sáu câu khác nhau. Gộp chung thành "hết lượt" là làm người dùng bỏ đi
// trong khi thực ra họ chỉ cần đợi ba giây.
export const QUOTA_MESSAGES: Record<string, string> = {
  burst: 'Bạn hỏi nhanh quá. Chờ vài giây rồi hỏi lại nhé.',
  in_flight:
    'Câu hỏi trước chưa trả lời xong. Đợi trợ lý trả lời hết rồi hãy hỏi tiếp nhé.',
  guest_daily:
    'Bạn đã dùng hết lượt hỏi miễn phí hôm nay. Đăng nhập để có thêm lượt nhé.',
  user_hourly:
    'Bạn đã hỏi khá nhiều trong một giờ qua. Thử lại sau ít phút nhé.',
  user_daily: 'Bạn đã dùng hết lượt hỏi hôm nay. Mai quay lại nhé.',
  global_daily:
    'Trợ lý đã hết lượt cho cả ngày hôm nay. Mai bot đi làm lại nhé.',
};

// Lỗi trả về TRƯỚC khi stream mở — lúc còn đọc được HTTP status và body JSON.
export const REQUEST_ERROR_MESSAGES: Record<string, string> = {
  bot_disabled: 'Trợ lý đang tạm nghỉ. Bạn dùng thanh tìm kiếm phía trên nhé.',
  unauthorized:
    'Phiên đăng nhập đã hết hạn. Bạn đăng nhập lại rồi hỏi tiếp nhé.',
  bad_question: `Câu hỏi đang trống hoặc dài quá ${MAX_QUESTION_LENGTH} ký tự.`,
  quota_unavailable:
    'Trợ lý đang trục trặc khi kiểm tra lượt. Thử lại sau ít phút nhé.',
  stream_unavailable: 'Không mở được kết nối tới trợ lý. Bạn thử lại nhé.',
};

// Lỗi xảy ra GIỮA stream, sau khi đã 200. Header đã gửi rồi nên BE không đổi được status
// nữa, event: error là đường duy nhất.
export const STREAM_ERROR_MESSAGES: Record<string, string> = {
  bot_unavailable:
    'Trợ lý đang quá tải nên nghỉ vài phút. Bạn thử lại sau nhé.',
  provider_rate_limited:
    'Trợ lý đang bận trả lời người khác. Chờ chút rồi hỏi lại nhé.',
  timeout:
    'Trợ lý trả lời lâu quá nên mình dừng lại. Bạn thử hỏi ngắn gọn hơn nhé.',
  blocked: 'Câu hỏi này mình không trả lời được. Bạn thử hỏi về sản phẩm nhé.',
  upstream: 'Có lỗi khi hỏi trợ lý. Bạn thử lại nhé.',
};

// Dùng khi BE thêm mã lý do mới mà FE chưa cập nhật. Thà một câu chung chung còn hơn hiện
// nguyên chuỗi mã tiếng Anh ra cho người mua hàng đọc.
export const FALLBACK_ERROR_MESSAGE = 'Có lỗi khi hỏi trợ lý. Bạn thử lại nhé.';

// Câu này gánh cả hai nguyên nhân vì đứng ở FE không phân biệt được: mạng hỏng, và chat-service
// đang khởi động sau khi ngủ. Nói riêng "kiểm tra mạng" là đổ lỗi nhầm cho người đang có mạng tốt.
export const NETWORK_ERROR_MESSAGE =
  'Chưa kết nối được tới trợ lý — có thể trợ lý đang khởi động. Thử lại sau vài giây nhé.';

// chat-service ngủ sau 15 phút nhàn rỗi và Render dựng lại mất 30–60 giây, nên trần phải rộng
// hơn hẳn con số đó. Quá mốc này thì chờ thêm cũng không khác gì một request đã chết — mà không
// có trần nào thì trình duyệt treo tới tận vài phút. Trần này áp vào đâu thì xem askBot.
export const BOT_CONNECT_TIMEOUT_MS = 75_000;

export const TRUNCATED_NOTICE =
  'Câu trả lời hơi dài nên bị cắt bớt. Bạn hỏi lại cụ thể hơn nhé.';

// Tên tool → câu tiếng Việt. BE cố ý chỉ gửi tên tool chứ không gửi chữ tiếng Việt, để phần
// hiển thị thuộc về FE.
export const TOOL_LABELS: Record<string, string> = {
  search_products: 'Đang tìm sản phẩm…',
};

export const FALLBACK_TOOL_LABEL = 'Đang tra cứu…';

// Nhãn cho quãng trước khi bot quyết định gọi tool hay trả lời thẳng. Quãng đó có thể kéo dài
// nhiều giây, và không có nhãn nào thì người dùng chỉ nhìn một bong bóng rỗng — TOOL_LABELS mãi
// tới khi event `tool` về mới vào cuộc.
export const THINKING_LABEL = 'Đang suy nghĩ…';

// Nhãn cho quãng còn sớm hơn nữa: chưa nhận được event `meta` nghĩa là chat-service còn chưa
// mở stream, và nó có thể đang dậy sau giấc ngủ 15 phút. Gọi quãng đó là "đang suy nghĩ" là nói
// sai — chưa liên lạc được với ai thì chưa có gì để nghĩ.
export const CONNECTING_LABEL = 'Đang kết nối tới trợ lý…';

// Khoá sessionStorage giữ kết quả /chat/config. sessionStorage chứ không localStorage: kill
// switch là thứ được bật lên giữa sự cố, và một câu trả lời cũ sống qua nhiều ngày nghĩa là
// widget vẫn ẩn sau khi bot đã bật lại.
//
// Giá trị lưu là JSON {enabled, at} chứ không phải chuỗi 'true'/'false' như trước: từ khi có
// kill switch tự động, cờ này tự tắt khi trần global vỡ và tự bật lại lúc nửa đêm mà không ai
// gọi gì cả. Không có mốc thời gian thì một tab mở từ chiều sẽ giấu nút chat tới hết phiên.
export const CONFIG_CACHE_STORAGE = 'chat_config_enabled';

// Năm phút: đủ dài để chuyển trang không đánh thức chat-service, đủ ngắn để quota hồi lúc nửa
// đêm thì tab đang mở thấy được trong vòng một lượt điều hướng.
export const CHAT_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

export const HISTORY_LOADING_NOTICE = 'Đang mở lại hội thoại cũ…';

// Những lý do đáng đưa kết quả tìm kiếm thay thế: chúng đều nghĩa là "hôm nay đừng quay lại nữa".
//
// Cố ý KHÔNG có 'burst' và 'in_flight': hai cái đó chỉ cần chờ vài giây, đẩy người dùng sang một
// luồng khác trong khi câu trả lời sắp tới nơi là làm hỏng chính cái họ đang đợi.
export const FALLBACK_SEARCH_REASONS = new Set([
  'guest_daily',
  'user_hourly',
  'user_daily',
  'global_daily',
  'bot_disabled',
  'bot_unavailable',
]);

// Số sản phẩm hiện trong panel. Năm là vừa một màn hình 24rem mà không phải cuộn — nhiều hơn
// thì khối sản phẩm che mất chính câu báo lỗi ở trên nó.
export const FALLBACK_RESULT_LIMIT = 5;

// Số sản phẩm xin từ server trước khi tự xếp hạng lại. Lấy dư vì BE chỉ sắp được theo MỘT cột
// nên nó không biết luật phá thế hoà bằng số đánh giá — xin đúng 5 là nhận 5 món đã bị chọn sai
// thứ tự trước khi tới tay mình.
export const RANKING_POOL_SIZE = 20;

export const FALLBACK_SEARCH_EMPTY =
  'Danh mục này chưa có sản phẩm nào. Bạn thử danh mục khác nhé.';

// Hai lời dẫn cho cùng một hàng chip. Ở màn hình trống nó là lựa chọn thêm bên cạnh việc hỏi;
// sau khi bị từ chối nó là đường duy nhất còn lại, nên câu chữ phải khác nhau.
export const CHIP_HEADING_IDLE = 'Hoặc xem nhanh theo danh mục:';

export const CHIP_HEADING_AFTER_REFUSAL = 'Bạn xem nhanh theo danh mục nhé:';
