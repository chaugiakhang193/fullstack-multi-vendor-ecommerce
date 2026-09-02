package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/telemetry"
	"github.com/felixge/httpsnoop"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

// traced boc mot route bang otelhttp va dat ten span theo pattern cua ServeMux, tuc "POST
// /chat/bot" thay vi mot chuoi tu dat. Doc len giong het dong dau cua access log, va them route
// moi thi khong phai nghi ra them mot cai ten nua.
//
// operation van truyen vao lam duong lui: spanNameFromPattern rot ve no khi r.Pattern rong, ca
// xay ra khi handler duoc goi ngoai ServeMux - vi du trong test.
func traced(operation string, handler http.Handler) http.Handler {
	nameByPattern := otelhttp.WithSpanNameFormatter(spanNameFromPattern)
	return otelhttp.NewHandler(handler, operation, nameByPattern)
}

// spanNameFromPattern tra ve pattern ServeMux da khop, gom ca method.
func spanNameFromPattern(operation string, r *http.Request) string {
	if r.Pattern == "" {
		return operation
	}
	return r.Pattern
}

// instrumented boc mot route bang ca hai tang do dac: span cho Jaeger va cap RED cho Prometheus.
//
// measured dat ngoai otelhttp de status ghi nhan duoc la ma cuoi cung gui ra client, va de
// duration bao gom ca phan thoi gian otelhttp chiem.
func instrumented(operation string, handler http.Handler) http.Handler {
	tracedHandler := traced(operation, handler)
	return measured(operation, tracedHandler)
}

// measured dem request theo status va do thoi gian xu ly theo endpoint.
//
// Dung httpsnoop.CaptureMetrics thay vi tu boc ResponseWriter: writer boc bang embedding chi con
// cac phuong thuc cua http.ResponseWriter, mat Flusher va Hijacker ma SSE /chat/bot va bat tay
// WebSocket can. httpsnoop giu lai cac interface writer goc co.
//
// Nhan endpoint dung lai spanNameFromPattern de ten span va nhan endpoint la cung mot chuoi, tra
// tu histogram sang trace khong phai doi ten.
//
// Voi /chat/bot, duration o day la tron thoi gian stream SSE, khong phai thoi gian den byte dau
// tien; nhan endpoint tach no khoi cac route con lai.
func measured(operation string, handler http.Handler) http.Handler {
	metrics := telemetry.GetMetrics()

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured := httpsnoop.CaptureMetrics(handler, w, r)

		status := strconv.Itoa(captured.Code)
		outcome := outcomeFromStatus(captured.Code)
		endpoint := spanNameFromPattern(operation, r)
		seconds := captured.Duration.Seconds()

		metrics.HTTPRequestsTotal.WithLabelValues(status, outcome).Inc()
		metrics.HTTPRequestDuration.WithLabelValues(endpoint).Observe(seconds)
	})
}

// outcomeFromStatus gop status ve ba nhom de query ty le loi khong phai loc bang regex tren nhan
// status.
//
// Middleware chi biet ma tra ve, khong biet ly do cu the cua mot 400 - ly do do nam o nhan reason
// trong body cua tung handler.
func outcomeFromStatus(code int) string {
	switch {
	case code >= 500:
		return "error"
	case code >= 400:
		return "client_error"
	default:
		return "served"
	}
}

// NewServer dung *http.Server voi route da gan san.
//
// botDeps truyen theo gia tri: moi truong deu la con tro nen ban sao van dung chung state - ke ca
// kill switch, vay nen cam co o tang handler co hieu luc ngay voi route da gan tu luc khoi dong.
//
// wsHandler nhan vao duoi dang http.Handler chu khong phai ws.Deps: httpapi khong can biet gi ve
// hub, ve frame hay ve vong ping. Nho vay hai package khong tao vong import, va test cua server
// gan duoc mot handler gia.
func NewServer(
	addr string,
	logger *slog.Logger,
	frontendURL string,
	botDeps BotDeps,
	chatDeps ChatDeps,
	wsHandler http.Handler,
) *http.Server {
	mux := http.NewServeMux()

	// /health va /metrics khong boc instrumented: cron keep-warm goi /health va Prometheus scrape
	// /metrics theo chu ky, dem ca hai vao chat_requests_total thi phan lon so dem se la traffic tu
	// quan sat chu khong phai traffic nguoi dung.
	mux.HandleFunc("GET /health", healthHandler(logger))
	mux.Handle("GET /metrics", telemetry.MetricsHandler())

	// CORS boc moi route duoi /chat: chung deu duoc goi tu trinh duyet. /health va /metrics thi
	// khong bao gio, va boc chung lai chi lam cron keep-warm co them mot cua de vuong.
	//
	// instrumented boc ngoai corsAllowlist: boc ben trong thi request bi CORS tu choi khong sinh
	// span va khong vao counter, dung luc can quan sat nhat la khi FRONTEND_URL dat lech domain.
	// Nhanh OPTIONS khong boc - preflight khong phai viec nghiep vu va luon tra 204.
	botRoute := corsAllowlist(frontendURL, botHandler(botDeps))
	mux.Handle("POST /chat/bot", instrumented("chat-bot-http", botRoute))
	// Preflight dang ky rieng vi ServeMux phan tuyen theo ca method: route "POST /chat/bot"
	// khong nhan OPTIONS, va trinh duyet se nhan 405 truoc khi kip gui request that.
	mux.Handle("OPTIONS /chat/bot", botRoute)

	// Config di truoc moi thu: FE goi no luc mount de biet co nen ve bong bong hay khong.
	configRoute := corsAllowlist(frontendURL, configHandler(botDeps.Switch, logger))
	mux.Handle("GET /chat/config", instrumented("chat-config-http", configRoute))
	mux.Handle("OPTIONS /chat/config", configRoute)

	// History KHONG doc co Enabled: kill switch chan duong tieu tien (goi Gemini), khong phai
	// duong doc. Bot nghi ma mo widget van thay hoi thoai hom qua moi la dung.
	historyRoute := corsAllowlist(frontendURL, historyHandler(botDeps))
	mux.Handle("GET /chat/history", instrumented("chat-history-http", historyRoute))
	mux.Handle("OPTIONS /chat/history", historyRoute)

	// Chat 1-1. Cung duoc CORS boc nhu moi route /chat khac: chung deu goi tu trinh duyet.
	conversationsRoute := corsAllowlist(frontendURL, conversationsHandler(chatDeps))
	mux.Handle("GET /chat/conversations", instrumented("chat-conversations-http", conversationsRoute))
	mux.Handle("OPTIONS /chat/conversations", conversationsRoute)

	messagesRoute := corsAllowlist(frontendURL, messagesHandler(chatDeps))
	mux.Handle("GET /chat/messages", instrumented("chat-messages-http", messagesRoute))
	mux.Handle("OPTIONS /chat/messages", messagesRoute)

	readRoute := corsAllowlist(frontendURL, readHandler(chatDeps))
	mux.Handle("POST /chat/read", instrumented("chat-read-http", readRoute))
	mux.Handle("OPTIONS /chat/read", readRoute)

	// /ws KHONG boc corsAllowlist: bat tay WebSocket khong phai request CORS - trinh duyet khong
	// gui preflight cho no va khong doc Access-Control-* trong phan hoi. Cua chan goc that su nam
	// trong websocket.AcceptOptions.OriginPatterns, ngay tai cho nang cap ket noi.
	//
	// /ws cung KHONG boc otelhttp: span server se song bang dung tuoi tho ket noi, tuc hang gio.
	// Mot span ba tieng nam canh span 200ms lam hong ca waterfall lan histogram duration. Duong
	// WS duoc do bang span rieng cho tung tin nhan, trong ws.handleSend.
	//
	// nil duoc: test cua package nay dung server khong co duong realtime.
	if wsHandler != nil {
		mux.Handle("GET /ws", wsHandler)
	}

	return &http.Server{
		Addr:    addr,
		Handler: mux,
		// Chi dat ReadHeaderTimeout, khong dat ReadTimeout/WriteTimeout: ket noi nay se
		// duoc nang cap len WebSocket song hang gio, deadline toan cuc se cat nham ket
		// noi dang khoe. ReadHeaderTimeout van chan duoc Slowloris.
		ReadHeaderTimeout: 5 * time.Second,
	}
}

// healthHandler tra 200 + JSON {"status":"ok"} cho health check cua Render va cho
// cron keep-warm.
func healthHandler(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body := map[string]string{"status": "ok"}
		writeJSON(w, logger, http.StatusOK, body)
	}
}

// writeJSON gom set header + status + encode, log neu ghi loi.
func writeJSON(w http.ResponseWriter, logger *slog.Logger, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		logger.Error("ghi response loi", "err", err)
	}
}
