package bot

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	// search-service ngu sau 15' idle, nen mot cu poke moi 10' la du giu am va con chua
	// lai 5' du phong.
	warmThrottle = 10 * time.Minute

	// Do 04/09/2026: mot lan danh thuc het khoang 14s. Giu tran o 90s vi cat ket noi som khien
	// Render huy spin-up giua chung, ma cu poke nay chay nen nen cho lau khong lam ai phai doi.
	warmTimeout = 90 * time.Second
)

// warmOutcome la ket cuc mot cu danh thuc. Khong export: no chi co nghia trong file nay.
//
// Cung ly do voi ToolOutcome - gia tri di thang vao log va duoc grep lai, nen mot chuoi
// tran go nham se lam mot nhom bien mat khoi ket qua tim ma khong co gi bao.
type warmOutcome string

const (
	warmSuccess   warmOutcome = "success"
	warmNon2xx    warmOutcome = "http_non_2xx"
	warmTransport warmOutcome = "transport_error"
	warmReqError  warmOutcome = "request_error"
	warmInFlight  warmOutcome = "suppressed_in_flight"
	warmThrottled warmOutcome = "suppressed_throttled"
	warmEmptyURL  warmOutcome = "suppressed_empty_url"
)

// warmDecision la ket qua cua cong vao: begin() phai noi duoc VI SAO bi chan, khong chi
// noi la co bi chan hay khong.
//
// Hai ly do doi hoi hai cach doc khac nhau. "Dang co cu poke chay" nghia la he thong dang
// lam viec. "Vua poke gan day" nghia la trong 10 phut qua da co mot cu poke THANH CONG -
// lastPoke chi duoc ghi sau 2xx - nen search-service le ra dang thuc.
type warmDecision int

const (
	warmProceed warmDecision = iota
	warmSuppressedInFlight
	warmSuppressedThrottled
)

// Warmer danh thuc search-service bang mot cu GET /health chay nen. chat-service goi search
// theo duong rieng chu khong di qua monolith nen can ban cua rieng no.
type Warmer struct {
	baseURL string
	http    *http.Client
	logger  *slog.Logger

	mu       sync.Mutex
	poking   bool
	lastPoke time.Time
}

// NewWarmer dung warmer cho mot search-service. baseURL rong thi Warm() khong lam gi.
func NewWarmer(baseURL string, logger *slog.Logger) *Warmer {
	return &Warmer{
		baseURL: strings.TrimRight(baseURL, "/"),
		http:    &http.Client{Timeout: warmTimeout},
		logger:  logger,
	}
}

// Warm poke /health mot lan, chay nen va nuot moi loi. Goi bao nhieu lan cung duoc: throttle
// gop ve toi da mot lan moi warmThrottle.
//
// Ham khong nhan ctx cua request goi toi. Request do sap ket thuc, trong khi cu danh thuc
// can song them ca phut nua moi co tac dung.
//
// trigger la ket cuc da keo cu poke nay ra. No di vao log de noi duoc cu danh thuc voi ly
// do sinh ra no, ma khong phai log cau hoi hay URL.
//
// Viec nuot loi giu NGUYEN: log chi them phan nhin thay duoc, khong doi mot nhanh re nao.
func (w *Warmer) Warm(trigger ToolOutcome) {
	if w.baseURL == "" {
		// Khong toi duoc tu main.go: no chi dung SearchTool khi SEARCH_SERVICE_URL khac rong.
		// Guard giu lai cho test, va o muc DEBUG de no khong doc nhu mot trang thai van hanh
		// co that.
		w.logger.Debug("danh thuc search", "outcome", string(warmEmptyURL), "trigger", string(trigger))
		return
	}

	switch w.begin() {
	case warmSuppressedInFlight:
		w.logger.Info("danh thuc search", "outcome", string(warmInFlight), "trigger", string(trigger))
		return
	case warmSuppressedThrottled:
		w.logger.Info("danh thuc search", "outcome", string(warmThrottled), "trigger", string(trigger))
		return
	}

	go func() {
		defer w.end()

		start := time.Now()
		ctx, cancel := context.WithTimeout(context.Background(), warmTimeout)
		defer cancel()

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, w.baseURL+"/health", nil)
		if err != nil {
			w.log(warmReqError, trigger, 0, start)
			return
		}
		resp, err := w.http.Do(req)
		if err != nil {
			// err khong duoc log: cung ly do voi SearchTool, *url.Error mang theo URL.
			w.log(warmTransport, trigger, 0, start)
			return
		}
		defer resp.Body.Close()

		// Chi ghi moc khi that su 2xx. 5xx tu edge-proxy luc service dang dung day van
		// resolve duoc, tinh la thanh cong se khoa throttle trong khi service chua san sang.
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			w.mu.Lock()
			w.lastPoke = time.Now()
			w.mu.Unlock()
			w.log(warmSuccess, trigger, resp.StatusCode, start)
			return
		}
		w.log(warmNon2xx, trigger, resp.StatusCode, start)
	}()
}

// log ghi mot dong cho mot cu poke da ket thuc. Gom lai mot cho de sau nay them truong
// khong phai sua bon lenh goi.
func (w *Warmer) log(outcome warmOutcome, trigger ToolOutcome, statusCode int, start time.Time) {
	w.logger.Info("danh thuc search",
		"outcome", string(outcome),
		"trigger", string(trigger),
		"statusCode", statusCode,
		"latencyMs", time.Since(start).Milliseconds(),
	)
}

// begin gianh quyen poke, va noi ro vi sao neu khong gianh duoc.
func (w *Warmer) begin() warmDecision {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.poking {
		return warmSuppressedInFlight
	}
	// lastPoke zero value cho time.Since mot khoang rat lon nen lan dau luon qua duoc.
	if time.Since(w.lastPoke) < warmThrottle {
		return warmSuppressedThrottled
	}

	w.poking = true
	return warmProceed
}

// end nha quyen poke.
func (w *Warmer) end() {
	w.mu.Lock()
	w.poking = false
	w.mu.Unlock()
}
