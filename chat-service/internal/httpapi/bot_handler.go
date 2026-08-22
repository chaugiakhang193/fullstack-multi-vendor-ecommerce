package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/auth"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/bot"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/quota"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/telemetry"
)

const (
	// maxQuestionRunes: cot body cua bang message gioi han 4000 ky tu, va mot cau hoi mua sam
	// dai hon 1000 thi phan thua chi la nhien lieu dot token.
	maxQuestionRunes = 1000

	// maxBodyBytes chan doc body qua lon TRUOC khi parse. Rune 4 byte + JSON escape nen de rong
	// gap ~8 lan gioi han rune.
	maxBodyBytes = 8 << 10
)

// BotAsker la phan cua tang dieu phoi ma handler can. Khai o day de test dung ban gia khong can
// Gemini that.
type BotAsker interface {
	Ask(ctx context.Context, question string, history []bot.Turn, sink bot.Sink) (bot.Result, error)
}

// BotDeps gom moi thu handler /chat/bot can. Truyen mot struct thay vi 6 tham so roi de them bot
// phu thuoc sau nay khong phai sua chu ky o ba cho.
type BotDeps struct {
	Asker    BotAsker
	Limiter  *quota.Limiter
	Cache    *bot.ReplyCache
	Verifier *auth.Verifier
	Logger   *slog.Logger

	// Enabled la kill switch. False = bot nghi, tra 503 co ly do ro rang.
	Enabled bool
}

// askRequest la body cua POST /chat/bot.
type askRequest struct {
	Question string `json:"question"`
}

// errorBody la khuon loi thong nhat cho moi truong hop tu choi TRUOC khi stream bat dau.
type errorBody struct {
	Reason string `json:"reason"`
	// RetryAfter tinh bang giay, 0 nghia la khong biet khi nao thu lai duoc.
	RetryAfter int `json:"retryAfter,omitempty"`
}

// botHandler tra loi cau hoi bang stream SSE.
//
// Thu tu cac cua:
//
//	kill switch -> auth -> doc body -> cache (+ Reserve) -> quota -> model
//
// Cache dung truoc quota vi quota ton tai de bao ve han muc Gemini, ma cache hit thi khong goi
// Gemini. Dat sau quota thi mot cau hoi pho bien van tru luot cua nguoi dung du no khong ton gi.
//
// Nhanh cache van qua Reserve: no khong tinh luot nhung van ghi hoi thoai xuong DB, nen can mot
// cua chan vong lap.
func botHandler(deps BotDeps) http.HandlerFunc {
	metrics := telemetry.GetMetrics()

	return func(w http.ResponseWriter, r *http.Request) {
		if !deps.Enabled {
			writeError(w, deps.Logger, http.StatusServiceUnavailable, errorBody{Reason: "bot_disabled"})
			return
		}

		subject, _, err := resolveSubject(r, deps.Verifier)
		if err != nil {
			writeError(w, deps.Logger, http.StatusUnauthorized, errorBody{Reason: "unauthorized"})
			return
		}

		question, err := readQuestion(w, r)
		if err != nil {
			writeError(w, deps.Logger, http.StatusBadRequest, errorBody{Reason: "bad_question"})
			return
		}

		if cached, ok := deps.Cache.Get(question); ok {
			// Khong tinh luot, nhung van qua co dang-chay: moi cache hit van la mot loat lenh
			// ghi xuong DB.
			release, decision := deps.Limiter.Reserve(subject)
			if !decision.Allowed {
				writeQuotaRejected(w, deps.Logger, metrics, decision)
				return
			}
			defer release()

			metrics.BotReplyCacheTotal.WithLabelValues("hit").Inc()
			streamCached(w, deps.Logger, cached)
			return
		}
		metrics.BotReplyCacheTotal.WithLabelValues("miss").Inc()

		release, decision, err := deps.Limiter.Acquire(r.Context(), subject)
		if err != nil {
			// Fail-closed: khong dem duoc thi khong biet dang dot bao nhieu.
			deps.Logger.Error("dem han muc loi", "err", err)
			writeError(w, deps.Logger, http.StatusServiceUnavailable, errorBody{Reason: "quota_unavailable"})
			return
		}
		defer release()

		if !decision.Allowed {
			writeQuotaRejected(w, deps.Logger, metrics, decision)
			return
		}

		streamAnswer(w, r, deps, metrics, question, decision)
	}
}

// writeQuotaRejected tra 429 kem ly do va goi y thoi diem thu lai.
//
// Dung chung cho ca hai duong tu choi (Reserve va Acquire) de FE chi phai xu ly mot khuon 429,
// va de them mot tang han muc sau nay khong phai sua hai cho.
func writeQuotaRejected(
	w http.ResponseWriter,
	logger *slog.Logger,
	metrics *telemetry.Metrics,
	decision quota.Decision,
) {
	metrics.BotQuotaRejectedTotal.WithLabelValues(string(decision.Reason)).Inc()

	retryAfter := int(decision.RetryAfter.Seconds())
	w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
	writeError(w, logger, http.StatusTooManyRequests, errorBody{
		Reason:     string(decision.Reason),
		RetryAfter: retryAfter,
	})
}

// streamAnswer mo stream roi day chu ra theo tung manh.
func streamAnswer(
	w http.ResponseWriter,
	r *http.Request,
	deps BotDeps,
	metrics *telemetry.Metrics,
	question string,
	decision quota.Decision,
) {
	writer, err := newSSEWriter(w)
	if err != nil {
		writeError(w, deps.Logger, http.StatusInternalServerError, errorBody{Reason: "stream_unavailable"})
		return
	}
	stopKeepalive := writer.startKeepalive()
	defer stopKeepalive()

	// Tu day khong doi status duoc nua: status da di cung byte dau tien. Moi loi sau diem nay
	// di bang event: error.
	if err := writer.event(eventMeta, map[string]any{"remaining": decision.Remaining}); err != nil {
		return
	}

	started := time.Now()
	sink := func(ev bot.Event) error {
		// Client dong tab -> ctx huy -> tra loi de bot.Service dung sinh. Khong lam viec nay thi
		// model van chay tiep va van dot token cho mot nguoi da di mat.
		if err := r.Context().Err(); err != nil {
			return err
		}

		switch ev.Kind {
		case bot.EventToolCall:
			name := ""
			if ev.ToolCall != nil {
				name = ev.ToolCall.Name
			}
			return writer.event(eventTool, map[string]string{"name": name})
		case bot.EventText:
			return writer.event(eventText, map[string]string{"v": ev.Text})
		default:
			return nil
		}
	}

	result, err := deps.Asker.Ask(r.Context(), question, nil, sink)
	if err != nil {
		// Khong gui noi dung loi that ra ngoai: no co the chua thong tin cua provider.
		deps.Logger.Error("hoi bot loi", "err", err, "latencyMs", time.Since(started).Milliseconds())
		_ = writer.event(eventError, map[string]string{"reason": botErrorReason(err)})
		return
	}

	metrics.BotTokensTotal.WithLabelValues("prompt").Add(float64(result.PromptTokens))
	metrics.BotTokensTotal.WithLabelValues("output").Add(float64(result.OutputTokens))

	if result.Text != "" && !result.Truncated {
		deps.Cache.Put(question, result.Text)
	}

	// Khong log noi dung cau hoi lan cau tra loi - chi do dai va so token.
	deps.Logger.Info("tra loi bot xong",
		"latencyMs", time.Since(started).Milliseconds(),
		"questionRunes", len([]rune(question)),
		"answerRunes", len([]rune(result.Text)),
		"promptTokens", result.PromptTokens,
		"outputTokens", result.OutputTokens,
		"truncated", result.Truncated,
	)

	_ = writer.event(eventDone, map[string]any{"cached": false, "truncated": result.Truncated})
}

// streamCached tra ve cau tra loi da co san, van bang SSE de FE chi co MOT duong doc.
func streamCached(w http.ResponseWriter, logger *slog.Logger, answer string) {
	writer, err := newSSEWriter(w)
	if err != nil {
		writeError(w, logger, http.StatusInternalServerError, errorBody{Reason: "stream_unavailable"})
		return
	}

	// Khong can keepalive: ba event di lien nhau trong vai micro giay.
	if err := writer.event(eventMeta, map[string]any{"cached": true}); err != nil {
		return
	}
	if err := writer.event(eventText, map[string]string{"v": answer}); err != nil {
		return
	}
	_ = writer.event(eventDone, map[string]any{"cached": true})
}

// botErrorReason doi loi noi bo thanh mot ma ngan cho FE. Khong bao gio tra nguyen van loi.
func botErrorReason(err error) string {
	switch {
	case errors.Is(err, bot.ErrCircuitOpen):
		return "bot_unavailable"
	case errors.Is(err, bot.ErrRateLimited):
		return "provider_rate_limited"
	case errors.Is(err, bot.ErrTimeout):
		return "timeout"
	case errors.Is(err, bot.ErrBlocked):
		return "blocked"
	default:
		return "upstream"
	}
}

// readQuestion doc va kiem cau hoi. Gioi han byte dat TRUOC parse de body 10MB khong bao gio
// duoc cap phat.
//
// Truyen w vao MaxBytesReader chu khong phai nil: khi vuot han, no bao lai cho tang http de dong
// ket noi thay vi de client tiep tuc bom byte vao mot request da bi tu choi.
func readQuestion(w http.ResponseWriter, r *http.Request) (string, error) {
	var payload askRequest
	limited := http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if err := json.NewDecoder(limited).Decode(&payload); err != nil {
		return "", err
	}

	question := strings.TrimSpace(payload.Question)
	if question == "" {
		return "", errors.New("cau hoi rong")
	}
	// Dem theo rune: mot cau tieng Viet 1000 ky tu chiem hon 1000 byte, cat theo byte se cat
	// nham nguoi dung Viet.
	if len([]rune(question)) > maxQuestionRunes {
		return "", errors.New("cau hoi qua dai")
	}
	return question, nil
}

// writeError tra loi JSON cho cac truong hop tu choi TRUOC khi stream bat dau.
func writeError(w http.ResponseWriter, logger *slog.Logger, status int, body errorBody) {
	writeJSON(w, logger, status, body)
}
