package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/search-service/internal/search"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/search-service/internal/telemetry"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

// NewServer dung *http.Server voi route da gan san. searcher lo /search.
func NewServer(addr string, logger *slog.Logger, searcher *search.Service) *http.Server {
	metrics := telemetry.GetMetrics()
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", healthHandler(logger))
	mux.Handle("GET /metrics", telemetry.MetricsHandler())

	// otelhttp.NewHandler chi boc route /search de khong sinh server span nhieu cho probe /health va /metrics
	searchHandlerWithOTel := otelhttp.NewHandler(http.HandlerFunc(searchHandler(logger, searcher, metrics)), "search-http")
	mux.Handle("GET /search", searchHandlerWithOTel)

	// Route rieng cho bot: tra field hien thi thay vi chi id. Tach khoi /search chu khong
	// them mot tham so vao no, vi hai duong co hinh dang tra ve khac han nhau.
	detailedHandlerWithOTel := otelhttp.NewHandler(http.HandlerFunc(searchDetailedHandler(logger, searcher, metrics)), "search-detailed-http")
	mux.Handle("GET /search/detailed", detailedHandlerWithOTel)

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
		writeJSON(w, logger, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// searchHandler parse query param, goi search.Service, tra JSON Result. q rong -> 400.
func searchHandler(logger *slog.Logger, searcher *search.Service, metrics *telemetry.Metrics) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if q == "" {
			metrics.HTTPRequestsTotal.WithLabelValues("400", "bad_request").Inc()
			metrics.HTTPRequestDuration.WithLabelValues("/search").Observe(time.Since(start).Seconds())
			writeJSON(w, logger, http.StatusBadRequest, map[string]string{"error": "thieu tham so q"})
			return
		}

		req := search.Request{
			Query:       q,
			Page:        atoiDefault(r.URL.Query().Get("page"), 1),
			Limit:       atoiDefault(r.URL.Query().Get("limit"), 0),
			MinPrice:    numericParam(r.URL.Query().Get("min_price")),
			MaxPrice:    numericParam(r.URL.Query().Get("max_price")),
			ShopID:      strPtr(r.URL.Query().Get("shop_id")),
			CategoryIDs: splitCSV(r.URL.Query().Get("category_ids")),
		}

		result, err := searcher.Search(r.Context(), req)
		duration := time.Since(start).Seconds()
		metrics.HTTPRequestDuration.WithLabelValues("/search").Observe(duration)

		if err != nil {
			if errors.Is(err, search.ErrEmptyQuery) {
				metrics.HTTPRequestsTotal.WithLabelValues("400", "bad_request").Inc()
				writeJSON(w, logger, http.StatusBadRequest, map[string]string{"error": "thieu tham so q"})
				return
			}
			// Client (monolith) cat ket noi khi vuot timeout AbortController -> r.Context() bi huy
			// -> query dang chay tra context.Canceled. Chuyen lanh tinh, khong phai loi service,
			// nen tach ra log INFO de khong lam nhieu error-rate. Response 500 ben duoi di vao hu
			// khong vi client da ngat, giu nguyen cho gon. Tach thanh 499 / client_canceled metric.
			if errors.Is(err, context.Canceled) {
				metrics.HTTPRequestsTotal.WithLabelValues("499", "client_canceled").Inc()
				logger.Info("client huy request search", "q", q)
			} else {
				metrics.HTTPRequestsTotal.WithLabelValues("500", "error").Inc()
				logger.Error("search loi", "err", err)
			}
			writeJSON(w, logger, http.StatusInternalServerError, map[string]string{"error": "loi noi bo"})
			return
		}

		outcome := "served"
		if result.Total == 0 {
			outcome = "empty"
		}
		metrics.HTTPRequestsTotal.WithLabelValues("200", outcome).Inc()
		writeJSON(w, logger, http.StatusOK, result)
	}
}

// searchDetailedHandler phuc vu chat-service: tra ve field hien thi cua toi da 5 san pham.
// Khong nhan page/limit/shop_id/category_ids — bot khong gui chung, va moi tham so nhan them
// la mot thu nua phai kiem.
func searchDetailedHandler(logger *slog.Logger, searcher *search.Service, metrics *telemetry.Metrics) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if q == "" {
			metrics.HTTPRequestsTotal.WithLabelValues("400", "bad_request").Inc()
			metrics.HTTPRequestDuration.WithLabelValues("/search/detailed").Observe(time.Since(start).Seconds())
			writeJSON(w, logger, http.StatusBadRequest, map[string]string{"error": "thieu tham so q"})
			return
		}

		req := search.Request{
			Query:    q,
			MinPrice: numericParam(r.URL.Query().Get("min_price")),
			MaxPrice: numericParam(r.URL.Query().Get("max_price")),
		}

		result, err := searcher.SearchDetailed(r.Context(), req)
		metrics.HTTPRequestDuration.WithLabelValues("/search/detailed").Observe(time.Since(start).Seconds())

		if err != nil {
			if errors.Is(err, search.ErrEmptyQuery) {
				metrics.HTTPRequestsTotal.WithLabelValues("400", "bad_request").Inc()
				writeJSON(w, logger, http.StatusBadRequest, map[string]string{"error": "thieu tham so q"})
				return
			}
			// Giong searchHandler: client cat ket noi la chuyen lanh tinh, tach ra khoi
			// error-rate de khong lam nhieu bao dong.
			if errors.Is(err, context.Canceled) {
				metrics.HTTPRequestsTotal.WithLabelValues("499", "client_canceled").Inc()
				logger.Info("client huy request search detailed", "q", q)
			} else {
				metrics.HTTPRequestsTotal.WithLabelValues("500", "error").Inc()
				logger.Error("search detailed loi", "err", err)
			}
			writeJSON(w, logger, http.StatusInternalServerError, map[string]string{"error": "loi noi bo"})
			return
		}

		outcome := "served"
		if len(result.Items) == 0 {
			outcome = "empty"
		}
		metrics.HTTPRequestsTotal.WithLabelValues("200", outcome).Inc()
		writeJSON(w, logger, http.StatusOK, result)
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

// atoiDefault parse int, fallback neu rong/sai. Am/0 de service tu chuan hoa.
func atoiDefault(s string, fallback int) int {
	if s == "" {
		return fallback
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return fallback
	}
	return n
}

// numericParam tra con tro string neu la so hop le (validate de cast ::numeric khong no),
// nil neu rong. Gia tri gui xuong DB la chuoi goc de so sanh numeric chinh xac.
func numericParam(s string) *string {
	if s == "" {
		return nil
	}
	if _, err := strconv.ParseFloat(s, 64); err != nil {
		return nil // sai dinh dang -> coi nhu khong loc, khong lam no cau SQL
	}
	return &s
}

// strPtr tra nil neu rong, nguoc lai con tro toi chuoi.
func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// splitCSV tach "a,b,c" thanh []string, bo phan tu rong. Rong -> nil (khong loc).
func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
