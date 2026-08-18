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

	// GeminiAPIKey khoa goi Gemini. De rong duoc: service van chay, chi tat nhanh bot.
	GeminiAPIKey string

	// GeminiModel ten model. De trong env de doi model khong can deploy lai.
	GeminiModel string

	// BotEnabled la kill switch cua nhanh chatbot (CHAT_BOT_ENABLED).
	BotEnabled bool

	// SearchServiceURL goc URL cua search-service (vd https://search-xxx.onrender.com).
	// De rong = bot van chay nhung KHONG dang ky tool search_products: no tra loi duoc cau
	// chao hoi va huong dan, chi khong tra cuu duoc san pham.
	SearchServiceURL string

	// FrontendURL goc URL cua storefront, dung de dung link san pham gui kem cau tra loi.
	FrontendURL string
}

// defaultHTTPPort khac 8090 cua search-service de hai service Go chay song song duoc
// tren cung mot may local ma khong tranh cong.
const defaultHTTPPort = "8091"

// defaultGeminiModel: flash-lite co RPD cao nhat va re nhat trong dong 2.5, du cho hoi
// dap san pham.
const defaultGeminiModel = "gemini-2.5-flash-lite"

// defaultFrontendURL tro ve dev server Next.js de chay local khong phai dat them bien.
const defaultFrontendURL = "http://localhost:3000"

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
		GeminiAPIKey:         getEnv("GEMINI_API_KEY", ""),
		GeminiModel:          getEnv("GEMINI_MODEL", defaultGeminiModel),
		// Mac dinh bat: tat la hanh dong co chu y, con quen bat thi den luc demo moi phat
		// hien. Thieu key van tat duoc nhanh bot (xem BotReady) nen mac dinh nay an toan.
		BotEnabled: getEnv("CHAT_BOT_ENABLED", "true") == "true",

		SearchServiceURL: getEnv("SEARCH_SERVICE_URL", ""),
		FrontendURL:      getEnv("FRONTEND_URL", defaultFrontendURL),
	}

	// JWT_ACCESS_SECRET khong kiem o day: no chi thanh bat buoc khi co code that su doc.
	// Bat buoc mot bien chua ai dung chi lam nguoi deploy phai bia gia tri cho qua.
	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL bat buoc nhung dang rong")
	}

	return cfg, nil
}

// BotReady bao co du dieu kien bat nhanh chatbot khong. Thieu key thi coi nhu tat du co
// bat co: de `docker compose up` chay duoc tren may chua co key, va de mot lan deploy
// quen dat key khong lam chet ca service — phan chat 1-1 van song.
func (c Config) BotReady() bool {
	return c.BotEnabled && c.GeminiAPIKey != ""
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
