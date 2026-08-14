package config

import (
	"fmt"
	"os"
)

// Config gom toan bo tham so runtime doc tu bien moi truong. Khong dung thu vien
// ngoai (viper/envconfig) de config doc duoc bang mat, va sai cau hinh thi chet ngay
// luc khoi dong chu khong phai luc dang phuc vu nguoi dung.
type Config struct {
	// HTTPPort cong HTTP server lang nghe (health, metrics, sau nay la /chat va /ws).
	HTTPPort string

	// DatabaseURL chuoi ket noi Neon DB#4 (postgres). Bat buoc co sslmode=require.
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

// defaultHTTPPort khac 8090 cua search-service de hai service Go chay song song duoc
// tren cung mot may local ma khong tranh cong.
const defaultHTTPPort = "8091"

// Load doc cau hinh tu env, ap default cho bien khong bat buoc, va tra loi cho bien
// bat buoc bi thieu (fail-fast ngay luc khoi dong thay vi chet luc runtime).
func Load() (Config, error) {
	cfg := Config{
		// PORT do Render (va Cloud Run) tiem vao, va ho port-scan theo dung bien nay -
		// nghe cong khac la deploy fail health check. Doc PORT truoc, CHAT_HTTP_PORT
		// giu lai cho local khong phai doi thoi quen.
		HTTPPort:             firstNonEmpty(os.Getenv("PORT"), os.Getenv("CHAT_HTTP_PORT"), defaultHTTPPort),
		DatabaseURL:          getEnv("DATABASE_URL", ""),
		LogLevel:             getEnv("LOG_LEVEL", "info"),
		OtelEnabled:          os.Getenv("OTEL_ENABLED") == "true",
		OtelServiceName:      getEnv("OTEL_SERVICE_NAME", "chat-service"),
		OtelExporterEndpoint: getEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318/v1/traces"),
	}

	// JWT_ACCESS_SECRET va GEMINI_API_KEY khong kiem o day: chung chi thanh bat buoc
	// khi co code that su doc chung. Bat buoc mot bien chua ai dung chi lam nguoi
	// deploy phai bia gia tri cho qua.
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

// firstNonEmpty tra ve gia tri khong rong dau tien. Dung cho bien co nhieu nguon theo
// thu tu uu tien (PORT cua nen tang > bien rieng cua service > default).
func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}
