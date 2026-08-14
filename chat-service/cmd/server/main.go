package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/config"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/httpapi"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/telemetry"
)

func main() {
	cfg, err := config.Load()
	logLevel := cfg.LogLevel
	logger := newLogger(logLevel)
	if err != nil {
		logger.Error("nap config loi", "err", err)
		os.Exit(1)
	}

	httpPort := cfg.HTTPPort
	logger.Info("chat-service khoi dong",
		"httpPort", httpPort,
		"otelEnabled", cfg.OtelEnabled,
	)

	// ctx bi huy khi nhan SIGINT (Ctrl+C) hoac SIGTERM (docker stop / Render deploy).
	// Day la tin hieu graceful shutdown cho HTTP server.
	bgCtx := context.Background()
	sigInt := syscall.SIGINT
	sigTerm := syscall.SIGTERM
	ctx, stop := signal.NotifyContext(bgCtx, sigInt, sigTerm)
	defer stop()

	// Khoi tao Telemetry (Metrics + OpenTelemetry TracerProvider).
	telemetry.InitMetrics()
	tp, err := telemetry.InitTracer(ctx, cfg.OtelEnabled, cfg.OtelServiceName, cfg.OtelExporterEndpoint)
	if err != nil {
		// Tracing hong khong duoc lam chet service: quan sat la chuc nang phu tro, khong
		// phai duong phuc vu chinh. Log warn roi tiep tuc.
		logger.Warn("khoi tao OpenTelemetry loi", "err", err)
	} else if tp != nil {
		logger.Info("OpenTelemetry SDK khoi tao thanh cong")
		defer func() {
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := tp.Shutdown(shutdownCtx); err != nil {
				logger.Error("Shutdown OpenTelemetry TracerProvider loi", "err", err)
			}
		}()
	}

	var wg sync.WaitGroup

	addr := ":" + httpPort
	srv := httpapi.NewServer(addr, logger)
	wg.Add(1)
	go func() {
		defer wg.Done()
		<-ctx.Done() // cho tin hieu shutdown
		// Cho toi da 10s xu not request dang chay roi dong.
		shutdownBgCtx := context.Background()
		shutdownTimeout := 10 * time.Second
		shutdownCtx, cancel := context.WithTimeout(shutdownBgCtx, shutdownTimeout)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			logger.Error("HTTP server shutdown loi", "err", err)
		}
	}()

	logger.Info("HTTP server lang nghe", "addr", srv.Addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("HTTP server dung bat thuong", "err", err)
		stop() // keo theo goroutine shutdown dung
	}

	// Cho goroutine shutdown xong moi thoat de khong cat ngang viec do.
	wg.Wait()
	logger.Info("chat-service da tat gon")
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
	handlerOptions := &slog.HandlerOptions{Level: lvl}
	handler := slog.NewJSONHandler(os.Stdout, handlerOptions)
	return slog.New(handler)
}
