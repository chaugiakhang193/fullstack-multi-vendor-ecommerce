package telemetry

import (
	"net/http"
	"sync"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Metrics chua cac Prometheus counters, histograms va gauges cua search-service.
type Metrics struct {
	HTTPRequestsTotal    *prometheus.CounterVec
	HTTPRequestDuration  *prometheus.HistogramVec
	EventsProcessedTotal *prometheus.CounterVec
	IndexProductsGauge   prometheus.Gauge
}

var (
	globalMetrics *Metrics
	metricsOnce   sync.Once
)

// InitMetrics khoi tao va dang ky cac metric voi Prometheus qua sync.Once de tranh panic dang ky trung.
func InitMetrics() *Metrics {
	metricsOnce.Do(func() {
		globalMetrics = &Metrics{
			HTTPRequestsTotal: promauto.NewCounterVec(
				prometheus.CounterOpts{
					Name: "search_requests_total",
					Help: "Tong so request HTTP den search-service phan theo status va outcome",
				},
				[]string{"status", "outcome"},
			),
			HTTPRequestDuration: promauto.NewHistogramVec(
				prometheus.HistogramOpts{
					Name:    "search_request_duration_seconds",
					Help:    "Thoi gian xu ly request HTTP search-service bang giay",
					Buckets: prometheus.DefBuckets,
				},
				[]string{"endpoint"},
			),
			EventsProcessedTotal: promauto.NewCounterVec(
				prometheus.CounterOpts{
					Name: "search_events_processed_total",
					Help: "Tong so consumer events da xu ly theo event_type va result",
				},
				[]string{"event_type", "result"},
			),
			IndexProductsGauge: promauto.NewGauge(
				prometheus.GaugeOpts{
					Name: "search_index_products_total",
					Help: "So luong san pham hien co trong index",
				},
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
