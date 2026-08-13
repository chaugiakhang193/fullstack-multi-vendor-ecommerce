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
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/search-service/internal/index"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/search-service/internal/search"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/search-service/internal/telemetry"
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
	rabbitmqURL := cfg.RabbitMQURL
	queueName := cfg.QueueName
	maskedURL := maskURL(rabbitmqURL)
	logger.Info("search-service khoi dong",
		"httpPort", httpPort,
		"rabbitmq", maskedURL,
		"queue", queueName,
		"otelEnabled", cfg.OtelEnabled,
	)

	// ctx bi huy khi nhan SIGINT (Ctrl+C) hoac SIGTERM (docker stop / Render).
	// Day la tin hieu graceful shutdown cho ca HTTP server lan consumer.
	bgCtx := context.Background()
	sigInt := syscall.SIGINT
	sigTerm := syscall.SIGTERM
	ctx, stop := signal.NotifyContext(bgCtx, sigInt, sigTerm)
	defer stop()

	// Khoi tao Telemetry (Metrics + OpenTelemetry TracerProvider)
	telemetry.InitMetrics()
	tp, err := telemetry.InitTracer(ctx, cfg.OtelEnabled, cfg.OtelServiceName, cfg.OtelExporterEndpoint)
	if err != nil {
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

	// Chay migration truoc khi mo pool/consumer de Neon san bang, fail-fast neu loi.
	databaseURL := cfg.DatabaseURL
	if err := index.RunMigrations(databaseURL); err != nil {
		logger.Error("chay migration loi", "err", err)
		os.Exit(1)
	}
	logger.Info("migration xong")

	// startupCtx rieng co timeout, khong dung ctx vong doi, de pool khong bi rang buoc
	// theo vong doi tin hieu shutdown.
	startupBgCtx := context.Background()
	startupTimeout := 15 * time.Second
	startupCtx, startupCancel := context.WithTimeout(startupBgCtx, startupTimeout)
	store, err := index.NewStore(startupCtx, databaseURL)
	startupCancel()
	if err != nil {
		logger.Error("mo store loi", "err", err)
		os.Exit(1)
	}
	// Close SAU khi consumer dung (wg.Wait o cuoi main dam bao). defer LIFO chay truoc return.
	defer store.Close()

	if err := store.UpdateIndexCountMetric(ctx); err != nil {
		logger.Warn("dem index luc khoi dong loi", "err", err)
	}

	var wg sync.WaitGroup

	// Cap nhat gauge co index dinh ky duoi nen moi 15s. Khong dem dong bo trong
	// upsert/delete vi count(*) tren Postgres phai quet MVCC, se nghen consumer khi
	// index lon dan (hang tram nghin san pham).
	//
	// Nam trong wg de store.Close() (defer o tren) khong chay khi goroutine nay con
	// dang query: defer chi chay sau wg.Wait() o cuoi main.
	wg.Add(1)
	go func() {
		defer wg.Done()
		refreshInterval := 15 * time.Second
		ticker := time.NewTicker(refreshInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				// Loi luc dang tat khong dang bao: ctx bi huy cat ngang query dang chay.
				if err := store.UpdateIndexCountMetric(ctx); err != nil && ctx.Err() == nil {
					logger.Warn("cap nhat gauge index loi", "err", err)
				}
			}
		}
	}()

	consumer := broker.NewConsumer(rabbitmqURL, queueName, store, logger)
	wg.Add(1)
	go func() {
		defer wg.Done()
		consumer.Run(ctx) // tu thoat khi ctx.Done()
	}()

	// Nguong giu row phai bang tuoi toi da mot message co the dat truoc khi duoc xu ly:
	// 30 ngay nam queue chinh, het TTL thi sang DLQ va dong ho chay LAI TU DAU, 30 ngay
	// nua o do. Cong 24h bien cho hai thu: TTL cua RabbitMQ het han kieu luoi (message
	// chi bi don khi troi toi dau queue) va deleted_at den tu dong ho monolith trong khi
	// nguong GC tinh bang now() cua Neon.
	//
	// Ghep o day chu khong tinh trong package index: hai hang so nam o broker, ma index
	// khong import broker duoc (broker da import index). Viet bang cong thuc chu khong
	// hardcode 61 ngay - ai doi TTL sau nay ma quen doi cho nay se mo lai lo hong mot
	// cach am tham.
	retentionMs := broker.MainQueueTTL + broker.DlqTTL
	retention := time.Duration(retentionMs)*time.Millisecond + 24*time.Hour

	retentionGC := index.NewRetentionGC(store, retention, cfg.RetentionGCEnabled, logger)
	wg.Add(1)
	go func() {
		defer wg.Done()
		retentionGC.Run(ctx)
	}()

	searcher := search.NewService(store.Pool())
	addr := ":" + httpPort
	srv := httpapi.NewServer(addr, logger, searcher)
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
	handlerOptions := &slog.HandlerOptions{Level: lvl}
	handler := slog.NewJSONHandler(os.Stdout, handlerOptions)
	return slog.New(handler)
}

// maskURL giau mat khau trong chuoi ket noi truoc khi log (amqp://user:pass@host).
func maskURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		unparseable := "amqp://<unparseable>"
		return unparseable
	}
	// Redacted() la ham chuan cua net/url: thay password bang "xxxxx" khi in,
	// khong bi ma hoa URL nhu "****" (tranh loi in ra %2A%2A%2A%2A).
	redactedURL := u.Redacted()
	return redactedURL
}
