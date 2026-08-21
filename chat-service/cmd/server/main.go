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

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/bot"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/bot/gemini"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/config"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/httpapi"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/quota"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/store"
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

	// Chay migration truoc khi mo HTTP: bang phai san truoc khi co request dau tien.
	// Fail-fast — service chay tren schema cu la kieu hong am tham nhat.
	databaseURL := cfg.DatabaseURL
	if err := store.RunMigrations(databaseURL); err != nil {
		logger.Error("chay migration loi", "err", err)
		os.Exit(1)
	}
	logger.Info("migration xong")

	// startupCtx rieng co timeout, khong dung ctx vong doi, de pool khong bi rang buoc
	// theo vong doi tin hieu shutdown.
	startupBgCtx := context.Background()
	startupTimeout := 15 * time.Second
	startupCtx, startupCancel := context.WithTimeout(startupBgCtx, startupTimeout)
	chatStore, err := store.NewStore(startupCtx, databaseURL)
	startupCancel()
	if err != nil {
		logger.Error("mo store loi", "err", err)
		os.Exit(1)
	}
	// defer chay theo LIFO va nam sau wg.Wait() o cuoi main, nen pool chi dong khi moi
	// goroutine da dung — khong cat ngang request dang chay.
	defer chatStore.Close()

	// Dung ca tang dieu phoi ngay luc khoi dong du chua co endpoint nao goi toi (SSE lam o
	// buoc sau): cau hinh sai lo ra bay gio, khong phai luc nguoi dung hoi cau dau tien.
	botService := buildBotService(cfg, logger)
	if botService != nil {
		logger.Info("nhanh bot san sang",
			"model", cfg.GeminiModel,
			"searchServiceURL", cfg.SearchServiceURL,
		)
	}

	// Dung o day, MOT lan cho ca service, chu khong de handler tu dung theo request: co dang-chay
	// cua Limiter va bo nho cua ReplyCache chi co nghia khi moi request dung CHUNG mot instance.
	// Dung theo request thi ca hai van bien dich, van chay, chi la khong con tac dung gi - dang
	// hong te nhat vi khong co dau hieu nao.
	//
	// Hom nay chua ai goi Acquire/Get/Put; ngay mai handler SSE nhan san hai thu nay.
	botLimiter := quota.NewLimiter(chatStore.Queries(), quota.Limits{
		GuestDaily:  cfg.BotGuestDailyLimit,
		UserDaily:   cfg.BotUserDailyLimit,
		UserHourly:  cfg.BotUserHourlyLimit,
		GlobalDaily: cfg.BotGlobalDailyLimit,
	})
	replyCache := bot.NewReplyCache(bot.DefaultReplyCacheTTL, bot.DefaultReplyCacheMaxEntries)
	// Bon truong deu la int32 nen gan nham thu tu o tren VAN bien dich va van xanh moi test.
	// Dong log nay la cho duy nhat lech do lo ra - dung bo no di.
	activeLimits := botLimiter.Limits()
	logger.Info("cong han muc bot san sang",
		"guestDaily", activeLimits.GuestDaily,
		"userDaily", activeLimits.UserDaily,
		"userHourly", activeLimits.UserHourly,
		"globalDaily", activeLimits.GlobalDaily,
		"replyCacheTTL", replyCache.TTL().String(),
	)

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

// buildBotService dung tang dieu phoi cua bot, hoac nil neu nhanh bot dang tat.
func buildBotService(cfg config.Config, logger *slog.Logger) *bot.Service {
	botClient := buildBotClient(cfg, logger)
	if botClient == nil {
		return nil
	}

	var searchTool *bot.SearchTool
	if cfg.SearchServiceURL == "" {
		// Khong phai loi: bot van tra loi duoc cau hoi khong can tra cuu san pham. Nhung day
		// la trang thai de quen tren prod nen phai keu len.
		logger.Warn("thieu SEARCH_SERVICE_URL, bot tra loi ma khong tra cuu duoc san pham")
	} else {
		searchTool = bot.NewSearchTool(cfg.SearchServiceURL, cfg.FrontendURL)
	}

	return bot.NewService(botClient, searchTool, logger)
}

// buildBotClient dung chuoi Breaker(Retrier(Gemini)), hoac nil neu nhanh bot dang tat.
//
// Thu tu boc co chu y: Breaker nam NGOAI Retrier de hai lan thu cua cung mot request chi
// tinh la mot lan hong, va de khi breaker dang mo thi tiet kiem duoc luon ca khoang cho
// giua hai lan thu.
func buildBotClient(cfg config.Config, logger *slog.Logger) bot.Client {
	if !cfg.BotReady() {
		logger.Warn("nhanh bot tat",
			"botEnabled", cfg.BotEnabled,
			"hasApiKey", cfg.GeminiAPIKey != "",
		)
		return nil
	}

	geminiClient, err := gemini.New(gemini.Config{
		APIKey: cfg.GeminiAPIKey,
		Model:  cfg.GeminiModel,
	})
	if err != nil {
		// Khong exit: bot hong thi phan chat 1-1 van phuc vu duoc, con bat service chet
		// vi mot tinh nang phu la tu ha ca dich vu.
		logger.Error("dung Gemini client loi, tat nhanh bot", "err", err)
		return nil
	}

	return bot.NewBreaker(bot.NewRetrier(geminiClient))
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
