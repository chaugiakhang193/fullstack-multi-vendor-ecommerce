package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

const (
	// keepaliveEvery: Cloudflare truoc Render cat ket noi im lang. Mot dong comment moi 20s
	// giu ket noi song ma khong lam FE phai xu ly gi (dong bat dau bang ":" bi bo qua theo
	// dung chuan SSE).
	keepaliveEvery = 20 * time.Second

	// Ten cac event tren day. FE switch theo may chuoi nay.
	eventMeta  = "meta"
	eventTool  = "tool"
	eventText  = "text"
	eventDone  = "done"
	eventError = "error"
)

// sseWriter ghi tung event ra ket noi dang mo.
//
// Co mutex vi keepalive chay o goroutine rieng, ma http.ResponseWriter khong an toan khi hai
// goroutine cung ghi. Thieu mutex thi mot dong ":keepalive" co the chen vao giua mot event JSON
// va lam FE parse hong: hiem va ngau nhien, nen rat kho lan ra.
type sseWriter struct {
	mu      sync.Mutex
	w       http.ResponseWriter
	flusher http.Flusher
}

// newSSEWriter set header roi flush ngay de trinh duyet biet ket noi da mo.
//
// Tra loi neu ResponseWriter khong ho tro Flush: khong Flush thi ca cau tra loi roi xuong mot
// cuc luc dong ket noi, tuc la khong con la stream nua, va hong kieu do khong sinh loi nao.
func newSSEWriter(w http.ResponseWriter) (*sseWriter, error) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return nil, fmt.Errorf("ResponseWriter khong ho tro Flush")
	}

	header := w.Header()
	header.Set("Content-Type", "text/event-stream")
	header.Set("Cache-Control", "no-cache")
	header.Set("Connection", "keep-alive")
	// Noi voi proxy dung dem: mot so proxy giu text/event-stream lai roi nha mot cuc.
	header.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	return &sseWriter{w: w, flusher: flusher}, nil
}

// event ghi mot event co ten kem payload JSON.
func (s *sseWriter) event(name string, payload any) error {
	// Marshal TRUOC khi lay khoa: khong giu khoa trong luc lam viec co the loi.
	encoded, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode payload cua event %s loi: %w", name, err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// json.Marshal khong bao gio sinh xuong dong tho (\n thanh \\n) nen mot event luon vua
	// dung mot dong data - khong phai cat dong.
	if _, err := fmt.Fprintf(s.w, "event: %s\ndata: %s\n\n", name, encoded); err != nil {
		return fmt.Errorf("ghi event %s loi: %w", name, err)
	}
	s.flusher.Flush()
	return nil
}

// keepalive ghi mot dong comment. Dong bat dau bang ":" la comment theo chuan SSE, client bo qua.
func (s *sseWriter) keepalive() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, err := fmt.Fprint(s.w, ": keepalive\n\n"); err != nil {
		return err
	}
	s.flusher.Flush()
	return nil
}

// startKeepalive chay keepalive dinh ky cho toi khi done dong. Tra ve ham dung.
//
// Ham dung duoc goi bang defer o handler: ket noi dong ma ticker con chay thi moi request de lai
// mot goroutine ro ri.
func (s *sseWriter) startKeepalive() func() {
	done := make(chan struct{})

	go func() {
		ticker := time.NewTicker(keepaliveEvery)
		defer ticker.Stop()

		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				// Loi o day nghia la ket noi da dut; khong co gi de lam ngoai viec dung.
				if err := s.keepalive(); err != nil {
					return
				}
			}
		}
	}()

	var once sync.Once
	return func() { once.Do(func() { close(done) }) }
}
