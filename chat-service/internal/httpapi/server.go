package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/telemetry"
)

// NewServer dung *http.Server voi route da gan san.
func NewServer(addr string, logger *slog.Logger) *http.Server {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", healthHandler(logger))
	mux.Handle("GET /metrics", telemetry.MetricsHandler())

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
