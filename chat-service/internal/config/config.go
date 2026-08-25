package config

import (
	"fmt"
	"os"
	"strconv"
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

	// MonolithURL goc URL cua monolith NestJS (vd https://xxx.onrender.com). Dung de hoi
	// seller nay so huu shop nao. De rong = phan inbox seller tat, phan buyer van chay.
	MonolithURL string

	// FrontendURL goc URL cua storefront, dung de dung link san pham gui kem cau tra loi.
	FrontendURL string

	// JWTAccessSecret secret HS256 DUNG CHUNG voi monolith de verify access token.
	// Lech mot ky tu voi monolith thi moi token deu bi tu choi trong khi token hoan toan dung.
	JWTAccessSecret string

	// BotGuestDailyLimit so cau hoi moi ngay cua khach vang lai, dem theo IP that.
	BotGuestDailyLimit int32

	// BotUserDailyLimit so cau hoi moi ngay cua mot tai khoan da dang nhap.
	BotUserDailyLimit int32

	// BotUserHourlyLimit tran theo gio cua mot tai khoan. Tran ngay mot minh khong chan duoc
	// nguoi dung dot sach 30 luot trong 2 phut roi bo di.
	BotUserHourlyLimit int32

	// BotGlobalDailyLimit tran cua CA service moi ngay. Day moi la con so cuu quota Gemini:
	// 100 IP x 5 tin da vuot free tier, nen quota ca nhan mot minh khong du.
	BotGlobalDailyLimit int32

	// BotBurstCapacity so cau duoc bam lien tuc truoc khi phai cho. Day la tran theo TOC DO,
	// giu trong RAM va dat truoc ca cache, nen request bi no chan khong cham DB lenh nao.
	BotBurstCapacity int32

	// BotBurstRefillSeconds so giay de hoi lai mot luot burst.
	BotBurstRefillSeconds int32
}

// defaultHTTPPort khac 8090 cua search-service de hai service Go chay song song duoc
// tren cung mot may local ma khong tranh cong.
const defaultHTTPPort = "8091"

// defaultGeminiModel: flash-lite la ban re nhat va co RPD cao nhat trong dong, du cho hoi
// dap san pham. Dong 2.5 da khoa voi key tao moi nen phai la 3.5 — xem gemini.DefaultModel.
const defaultGeminiModel = "gemini-3.5-flash-lite"

// defaultFrontendURL tro ve dev server Next.js de chay local khong phai dat them bien.
const defaultFrontendURL = "http://localhost:3000"

// Han muc mac dinh. Con so du de mot nguoi thu that long, khong du de mot nguoi dot sach
// quota Gemini cua ca ngay.
const (
	defaultBotGuestDailyLimit  = 5
	defaultBotUserDailyLimit   = 30
	defaultBotUserHourlyLimit  = 10
	defaultBotGlobalDailyLimit = 300

	defaultBotBurstCapacity      = 10
	defaultBotBurstRefillSeconds = 6
)

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
		MonolithURL:      getEnv("MONOLITH_URL", ""),
		FrontendURL:      getEnv("FRONTEND_URL", defaultFrontendURL),
		JWTAccessSecret:  getEnv("JWT_ACCESS_SECRET", ""),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL bat buoc nhung dang rong")
	}
	// Bien nay duoc doc that khi verify token o /chat/bot. Thieu ma van chay thi moi user dang
	// nhap am tham bi coi la khach vang lai: tut tu 30 luot xuong 5 luot/ngay theo IP, khong co
	// dau hieu nao ngoai viec nguoi dung keu.
	if cfg.JWTAccessSecret == "" {
		return Config{}, fmt.Errorf("JWT_ACCESS_SECRET bat buoc nhung dang rong")
	}

	// Han muc doc sau cung vi day la nhom duy nhat co the fail vi gia tri SAI DINH DANG, khac
	// cac bien tren chi fail vi THIEU.
	var err error
	if cfg.BotGuestDailyLimit, err = positiveIntEnv("BOT_GUEST_DAILY_LIMIT", defaultBotGuestDailyLimit); err != nil {
		return Config{}, err
	}
	if cfg.BotUserDailyLimit, err = positiveIntEnv("BOT_USER_DAILY_LIMIT", defaultBotUserDailyLimit); err != nil {
		return Config{}, err
	}
	if cfg.BotUserHourlyLimit, err = positiveIntEnv("BOT_USER_HOURLY_LIMIT", defaultBotUserHourlyLimit); err != nil {
		return Config{}, err
	}
	if cfg.BotGlobalDailyLimit, err = positiveIntEnv("BOT_DAILY_GLOBAL_LIMIT", defaultBotGlobalDailyLimit); err != nil {
		return Config{}, err
	}
	if cfg.BotBurstCapacity, err = positiveIntEnv("BOT_BURST_CAPACITY", defaultBotBurstCapacity); err != nil {
		return Config{}, err
	}
	if cfg.BotBurstRefillSeconds, err = positiveIntEnv("BOT_BURST_REFILL_SECONDS", defaultBotBurstRefillSeconds); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

// positiveIntEnv doc mot bien han muc. Bien khong dat thi lay mac dinh; dat nhung sai dinh
// dang thi TRA LOI chu khong lang le roi ve mac dinh.
//
// Day la cho co chu y khac voi OTEL_TRACES_SAMPLER_ARG ben search-service (chon fail-open):
// sampler hong thi mat bieu do, con han muc hong thi nguoi deploy tin nham rang minh da siet
// trong khi khong siet gi ca.
func positiveIntEnv(key string, fallback int32) (int32, error) {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback, nil
	}

	// bitSize 32 de gia tri qua lon bi bat ngay tai day, thay vi tran am sau khi ep kieu.
	parsed, err := strconv.ParseInt(raw, 10, 32)
	if err != nil {
		return 0, fmt.Errorf("%s=%q khong phai so nguyen 32-bit hop le", key, raw)
	}
	// 0 vua doc duoc la "cam han" vua doc duoc la "chua cau hinh"; da co CHAT_BOT_ENABLED lam
	// cong tac tuong minh nen o day coi la loi.
	if parsed <= 0 {
		return 0, fmt.Errorf("%s=%d phai lon hon 0; muon tat han bot thi dung CHAT_BOT_ENABLED=false", key, parsed)
	}
	return int32(parsed), nil
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
