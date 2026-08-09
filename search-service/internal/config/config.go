package config

import (
	"fmt"
	"os"
)

// Config gom toan bo tham so runtime doc tu bien moi truong. Khong dung thu
// vien ngoai (viper/envconfig) de giu nghe va tuong minh.
type Config struct {
	// HTTPPort cong HTTP server lang nghe (health, sau nay la /search).
	HTTPPort string

	// RabbitMQURL chuoi ket noi broker, vd amqp://guest:guest@localhost:5672
	RabbitMQURL string

	// QueueName ten queue consumer khai bao va tieu thu.
	QueueName string

	// DatabaseURL chuoi ket noi Neon DB#3 (postgres). Bat buoc co sslmode=require.
	DatabaseURL string

	// LogLevel: debug | info | warn | error
	LogLevel string

	// OtelEnabled bat/tat OpenTelemetry distributed tracing (mac dinh false).
	OtelEnabled bool

	// OtelServiceName ten service hien thi tren OTel tracing system.
	OtelServiceName string

	// OtelExporterEndpoint endpoint nhan OTLP HTTP traces (vd http://localhost:4318/v1/traces).
	OtelExporterEndpoint string
}

// defaultQueueName giu nguyen ten queue cu de khong doi hanh vi mac dinh.
const defaultQueueName = "search_index.q"

// Load doc cau hinh tu env, ap default cho bien khong bat buoc, va tra loi cho
// bien bat buoc bi thieu (fail-fast ngay luc khoi dong thay vi chet luc runtime).
func Load() (Config, error) {
	cfg := Config{
		// PORT do Render (va Cloud Run) tiem vao, va ho port-scan theo dung bien
		// nay — nghe cong khac la deploy fail health check. Doc PORT truoc,
		// SEARCH_HTTP_PORT giu lai cho local khong phai doi thoi quen.
		HTTPPort:    firstNonEmpty(os.Getenv("PORT"), os.Getenv("SEARCH_HTTP_PORT"), "8090"),
		RabbitMQURL: getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672"),
		// Doi ten queue o local de KHONG giành message voi ban tren Render: hai
		// queue khac ten cung bind vao topic exchange thi moi queue nhan mot BAN SAO,
		// con chung ten thi RabbitMQ chia round-robin, moi ben an mot nua event.
		QueueName:            getEnv("SEARCH_QUEUE_NAME", defaultQueueName),
		DatabaseURL:          getEnv("DATABASE_URL", ""),
		LogLevel:             getEnv("LOG_LEVEL", "info"),
		OtelEnabled:          os.Getenv("OTEL_ENABLED") == "true",
		OtelServiceName:      getEnv("OTEL_SERVICE_NAME", "search-service"),
		OtelExporterEndpoint: getEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318/v1/traces"),
	}

	if cfg.RabbitMQURL == "" {
		return Config{}, fmt.Errorf("RABBITMQ_URL bat buoc nhung dang rong")
	}
	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL bat buoc nhung dang rong")
	}

	return cfg, nil
}

// getEnv tra ve gia tri bien moi truong, hoac fallback neu chua dat hoac rong.
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// firstNonEmpty tra ve gia tri khong rong dau tien. Dung cho bien co nhieu nguon
// theo thu tu uu tien (PORT cua nen tang > bien rieng cua service > default).
func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}
