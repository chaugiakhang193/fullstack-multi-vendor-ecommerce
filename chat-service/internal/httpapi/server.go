package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/telemetry"
)

// NewServer dung *http.Server voi route da gan san.
//
// botDeps truyen theo gia tri: moi truong deu la con tro nen ban sao van dung chung state - ke ca
// kill switch, vay nen cam co o tang handler co hieu luc ngay voi route da gan tu luc khoi dong.
func NewServer(addr string, logger *slog.Logger, frontendURL string, botDeps BotDeps) *http.Server {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", healthHandler(logger))
	mux.Handle("GET /metrics", telemetry.MetricsHandler())

	// CORS boc moi route duoi /chat: chung deu duoc goi tu trinh duyet. /health va /metrics thi
	// khong bao gio, va boc chung lai chi lam cron keep-warm co them mot cua de vuong.
	botRoute := corsAllowlist(frontendURL, botHandler(botDeps))
	mux.Handle("POST /chat/bot", botRoute)
	// Preflight dang ky rieng vi ServeMux phan tuyen theo ca method: route "POST /chat/bot"
	// khong nhan OPTIONS, va trinh duyet se nhan 405 truoc khi kip gui request that.
	mux.Handle("OPTIONS /chat/bot", botRoute)

	// Config di truoc moi thu: FE goi no luc mount de biet co nen ve bong bong hay khong.
	configRoute := corsAllowlist(frontendURL, configHandler(botDeps.Switch, logger))
	mux.Handle("GET /chat/config", configRoute)
	mux.Handle("OPTIONS /chat/config", configRoute)

	// History KHONG doc co Enabled: kill switch chan duong tieu tien (goi Gemini), khong phai
	// duong doc. Bot nghi ma mo widget van thay hoi thoai hom qua moi la dung.
	historyRoute := corsAllowlist(frontendURL, historyHandler(botDeps))
	mux.Handle("GET /chat/history", historyRoute)
	mux.Handle("OPTIONS /chat/history", historyRoute)

	return &http.Server{
		Addr:    addr,
		Handler: mux,
		// Chi dat ReadHeaderTimeout, khong dat ReadTimeout/WriteTimeout: ket noi nay se
		// duoc nang cap len WebSocket song hang gio, deadline toan cuc se cat nham ket
		// noi dang khoe. ReadHeaderTimeout van chan duoc Slowloris.
		ReadHeaderTimeout: 5 * time.Second,
	}
}

// healthHandler tra 200 + JSON {"status":"ok"} cho health check cua Render va cho
// cron keep-warm.
func healthHandler(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body := map[string]string{"status": "ok"}
		writeJSON(w, logger, http.StatusOK, body)
	}
}

// writeJSON gom set header + status + encode, log neu ghi loi.
func writeJSON(w http.ResponseWriter, logger *slog.Logger, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		logger.Error("ghi response loi", "err", err)
	}
}
