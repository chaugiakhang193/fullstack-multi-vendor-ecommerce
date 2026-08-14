package telemetry

import (
	"net/http"
	"sync"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Metrics chua cac Prometheus metric cua chat-service. Hien chi co 2 metric HTTP; metric
// cua bot va cua websocket hub se them cung tinh nang phat ra chung, de dashboard khong
// co duong thang bang 0 cua metric chua ai emit.
type Metrics struct {
	HTTPRequestsTotal   *prometheus.CounterVec
	HTTPRequestDuration *prometheus.HistogramVec
}

var (
	globalMetrics *Metrics
	metricsOnce   sync.Once
)

// InitMetrics khoi tao va dang ky metric voi Prometheus qua sync.Once de tranh panic
// dang ky trung khi bi goi tu nhieu cho.
func InitMetrics() *Metrics {
	metricsOnce.Do(func() {
		globalMetrics = &Metrics{
			HTTPRequestsTotal: promauto.NewCounterVec(
				prometheus.CounterOpts{
					Name: "chat_requests_total",
					Help: "Tong so request HTTP den chat-service phan theo status va outcome",
				},
				[]string{"status", "outcome"},
			),
			HTTPRequestDuration: promauto.NewHistogramVec(
				prometheus.HistogramOpts{
					Name:    "chat_request_duration_seconds",
					Help:    "Thoi gian xu ly request HTTP chat-service bang giay",
					Buckets: prometheus.DefBuckets,
				},
				[]string{"endpoint"},
			),
		}
	})
	return globalMetrics
}

// GetMetrics truy cap instance metrics toan cuc.
func GetMetrics() *Metrics {
	return InitMetrics()
}

// MetricsHandler cung cap HTTP handler phuc vu scraping metrics tai endpoint /metrics.
func MetricsHandler() http.Handler {
	return promhttp.Handler()
}
