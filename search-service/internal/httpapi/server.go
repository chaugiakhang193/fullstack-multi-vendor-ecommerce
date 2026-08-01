package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"
)

// NewServer dung *http.Server voi router da gan san route. Tach ham nay de main
// chi lo vong doi (start/shutdown), con dinh tuyen nam gon mot cho — sau nay
// them /search chi sua o day.
func NewServer(addr string, logger *slog.Logger) *http.Server {
	mux := http.NewServeMux()

	// Go 1.22+ cho phep khai bao method + path ngay trong pattern.
	mux.HandleFunc("GET /health", healthHandler(logger))

	return &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
}

// healthHandler tra 200 + JSON {"status":"ok"} de cron keep-warm / load balancer
// biet service con song.
func healthHandler(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(w).Encode(map[string]string{"status": "ok"}); err != nil {
			logger.Error("ghi response /health loi", "err", err)
		}
	}
}
