package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/search-service/internal/broker"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/search-service/internal/config"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/search-service/internal/httpapi"
)

func main() {
	cfg, err := config.Load()
	logger := newLogger(cfg.LogLevel)
	if err != nil {
		logger.Error("nap config loi", "err", err)
		os.Exit(1)
	}

	logger.Info("search-service khoi dong",
		"httpPort", cfg.HTTPPort,
		"rabbitmq", maskURL(cfg.RabbitMQURL),
	)

	// ctx bi huy khi nhan SIGINT (Ctrl+C) hoac SIGTERM (docker stop / Render).
	// Day la tin hieu graceful shutdown cho ca HTTP server lan consumer.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	var wg sync.WaitGroup

	// --- Consumer RabbitMQ (T5) ---
	consumer := broker.NewConsumer(cfg.RabbitMQURL, logger)
	wg.Add(1)
	go func() {
		defer wg.Done()
		consumer.Run(ctx) // tu thoat khi ctx.Done()
	}()

	// --- HTTP server (T4) ---
	srv := httpapi.NewServer(":"+cfg.HTTPPort, logger)
	wg.Add(1)
	go func() {
		defer wg.Done()
		<-ctx.Done() // cho tin hieu shutdown
		// Cho toi da 10s xu not request dang chay roi dong.
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			logger.Error("HTTP server shutdown loi", "err", err)
		}
	}()

	logger.Info("HTTP server lang nghe", "addr", srv.Addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("HTTP server dung bat thuong", "err", err)
		stop() // keo theo consumer dung
	}

	// Cho consumer + goroutine shutdown xong moi thoat de khong cat ngang viec do.
	wg.Wait()
	logger.Info("search-service da tat gon")
}

// newLogger dung slog logger JSON theo level cau hinh.
func newLogger(level string) *slog.Logger {
	var lvl slog.Level
	switch level {
	case "debug":
		lvl = slog.LevelDebug
	case "warn":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: lvl})
	return slog.New(handler)
}

// maskURL giau mat khau trong chuoi ket noi truoc khi log (amqp://user:pass@host).
func maskURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return "amqp://<unparseable>"
	}
	// Redacted() la ham chuan cua net/url: thay password bang "xxxxx" khi in,
	// khong bi ma hoa URL nhu "****" (tranh loi in ra %2A%2A%2A%2A).
	return u.Redacted()
}
