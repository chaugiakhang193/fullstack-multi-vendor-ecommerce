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

	// DatabaseURL chuoi ket noi Neon DB#3 (postgres). Bat buoc co sslmode=require.
	DatabaseURL string

	// LogLevel: debug | info | warn | error
	LogLevel string
}

// Load doc cau hinh tu env, ap default cho bien khong bat buoc, va tra loi cho
// bien bat buoc bi thieu (fail-fast ngay luc khoi dong thay vi chet luc runtime).
func Load() (Config, error) {
	cfg := Config{
		HTTPPort:    getEnv("SEARCH_HTTP_PORT", "8090"),
		RabbitMQURL: getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672"),
		DatabaseURL: getEnv("DATABASE_URL", ""),
		LogLevel:    getEnv("LOG_LEVEL", "info"),
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
