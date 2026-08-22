package telemetry

import (
	"net/http"
	"sync"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Metrics chua cac Prometheus metric cua chat-service. Metric duoc them cung tinh nang phat ra
// no, de dashboard khong co duong thang bang 0 cua metric chua ai emit; nhom bot xuat hien o
// day cung luc endpoint /chat/bot bat dau chay.
type Metrics struct {
	HTTPRequestsTotal   *prometheus.CounterVec
	HTTPRequestDuration *prometheus.HistogramVec

	// BotQuotaRejectedTotal dem request bi cong han muc tu choi, tach theo tang. Day la duong
	// bieu do cho biet han muc dang siet dung cho hay siet nham nguoi dung that.
	BotQuotaRejectedTotal *prometheus.CounterVec

	// BotReplyCacheTotal dem hit/miss. Ty le hit chinh la so lan KHONG phai goi Gemini.
	BotReplyCacheTotal *prometheus.CounterVec

	// BotTokensTotal dem token da tieu, tach prompt/output. Han muc dem theo cau hoi con Gemini
	// tinh theo token, nen phai do ca hai moi biet 300 cau/ngay thuc su ton bao nhieu.
	BotTokensTotal *prometheus.CounterVec
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
			BotQuotaRejectedTotal: promauto.NewCounterVec(
				prometheus.CounterOpts{
					Name: "chat_bot_quota_rejected_total",
					Help: "So request bi cong han muc bot tu choi, tach theo tang",
				},
				[]string{"reason"},
			),
			BotReplyCacheTotal: promauto.NewCounterVec(
				prometheus.CounterOpts{
					Name: "chat_bot_reply_cache_total",
					Help: "So lan tra loi tu cache (hit) va so lan phai goi model (miss)",
				},
				[]string{"result"},
			),
			BotTokensTotal: promauto.NewCounterVec(
				prometheus.CounterOpts{
					Name: "chat_bot_tokens_total",
					Help: "Tong token da tieu voi Gemini, tach prompt va output",
				},
				[]string{"kind"},
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
