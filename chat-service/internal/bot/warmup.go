package bot

import (
	"context"
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

// Warmer danh thuc search-service bang mot cu GET /health chay nen. chat-service goi search
// theo duong rieng chu khong di qua monolith nen can ban cua rieng no.
type Warmer struct {
	baseURL string
	http    *http.Client

	mu       sync.Mutex
	poking   bool
	lastPoke time.Time
}

// NewWarmer dung warmer cho mot search-service. baseURL rong thi Warm() khong lam gi.
func NewWarmer(baseURL string) *Warmer {
	return &Warmer{
		baseURL: strings.TrimRight(baseURL, "/"),
		http:    &http.Client{Timeout: warmTimeout},
	}
}

// Warm poke /health mot lan, chay nen va nuot moi loi. Goi bao nhieu lan cung duoc: throttle
// gop ve toi da mot lan moi warmThrottle.
//
// Ham khong nhan ctx cua request goi toi. Request do sap ket thuc, trong khi cu danh thuc
// can song them ca phut nua moi co tac dung.
func (w *Warmer) Warm() {
	if w.baseURL == "" || !w.begin() {
		return
	}

	go func() {
		defer w.end()

		ctx, cancel := context.WithTimeout(context.Background(), warmTimeout)
		defer cancel()

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, w.baseURL+"/health", nil)
		if err != nil {
			return
		}
		resp, err := w.http.Do(req)
		if err != nil {
			return
		}
		defer resp.Body.Close()

		// Chi ghi moc khi that su 2xx. 5xx tu edge-proxy luc service dang dung day van
		// resolve duoc, tinh la thanh cong se khoa throttle trong khi service chua san sang.
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			w.mu.Lock()
			w.lastPoke = time.Now()
			w.mu.Unlock()
		}
	}()
}

// begin gianh quyen poke: false neu dang co mot cu poke chay hoac vua poke gan day.
func (w *Warmer) begin() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	// lastPoke zero value cho time.Since mot khoang rat lon nen lan dau luon qua duoc.
	if w.poking || time.Since(w.lastPoke) < warmThrottle {
		return false
	}
	w.poking = true
	return true
}

// end nha quyen poke.
func (w *Warmer) end() {
	w.mu.Lock()
	w.poking = false
	w.mu.Unlock()
}
