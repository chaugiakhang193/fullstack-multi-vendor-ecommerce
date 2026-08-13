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

	// Ba gauge duoi phuc vu retention GC. Hai cai dau la chan doan (bang nao la thu
	// pham), cai thu ba moi la thu do dung rang buoc that: han muc dia cua Neon free.
	// Dem row hai bang nho khong the phat hien index GIN cua product_index phinh.
	TombstoneRowsGauge       prometheus.Gauge
	ProcessedEventsRowsGauge prometheus.Gauge
	DatabaseSizeBytesGauge   prometheus.Gauge
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
			TombstoneRowsGauge: promauto.NewGauge(
				prometheus.GaugeOpts{
					Name: "search_tombstone_rows_total",
					Help: "So row hien co trong deleted_products_tombstone",
				},
			),
			ProcessedEventsRowsGauge: promauto.NewGauge(
				prometheus.GaugeOpts{
					Name: "search_processed_events_rows_total",
					Help: "So row hien co trong processed_events",
				},
			),
			DatabaseSizeBytesGauge: promauto.NewGauge(
				prometheus.GaugeOpts{
					Name: "search_db_size_bytes",
					Help: "Kich thuoc database DB#3 theo pg_database_size, tinh bang byte",
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
