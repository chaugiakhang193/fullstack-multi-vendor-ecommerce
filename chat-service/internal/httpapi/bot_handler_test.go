package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/auth"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/bot"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/killswitch"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/quota"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/store/chatdb"
)

// testClientIP la IP that ma askRequestFor gia lap. Tach thanh hang so vi test cua co dang-chay
// phai dung dung subject do de gianh co.
const testClientIP = "14.169.17.140"

// fakeAsker tra ve chu da dinh san, khong goi Gemini.
type fakeAsker struct {
	chunks []string
	err    error
	calls  int
}

func (f *fakeAsker) Ask(_ context.Context, _ string, _ []bot.Turn, sink bot.Sink) (bot.Result, error) {
	f.calls++
	if f.err != nil {
		return bot.Result{}, f.err
	}

	var full strings.Builder
	for _, chunk := range f.chunks {
		if err := sink(bot.Event{Kind: bot.EventText, Text: chunk}); err != nil {
			return bot.Result{}, err
		}
		full.WriteString(chunk)
	}
	return bot.Result{Text: full.String(), PromptTokens: 10, OutputTokens: 20}, nil
}

// fakeUsageCounter dem trong bo nho de Limiter chay duoc ma khong can Postgres.
type fakeUsageCounter struct{ counts map[string]int32 }

func (f *fakeUsageCounter) IncrementBotUsage(_ context.Context, arg chatdb.IncrementBotUsageParams) (int32, error) {
	if f.counts == nil {
		f.counts = make(map[string]int32)
	}
	f.counts[arg.SubjectKey]++
	return f.counts[arg.SubjectKey], nil
}

func testDeps(t *testing.T, asker BotAsker) BotDeps {
	t.Helper()

	verifier, err := auth.NewVerifier(testJWTSecret)
	if err != nil {
		t.Fatalf("NewVerifier loi: %v", err)
	}
	limits := quota.Limits{GuestDaily: 2, UserDaily: 5, UserHourly: 5, GlobalDaily: 10}
	return BotDeps{
		Asker:   asker,
		Limiter: quota.NewLimiter(&fakeUsageCounter{}, limits),
		Cache:   bot.NewReplyCache(bot.DefaultReplyCacheTTL, bot.DefaultReplyCacheMaxEntries),
		// Suc chua rong de cac test khac khong phai nghi ve cua nay. Test cua chinh Burst tu dat
		// lai deps.Burst bang mot gao be.
		Burst:    quota.NewBurst(100, time.Second),
		Verifier: verifier,
		Logger:   slog.New(slog.NewJSONHandler(io.Discard, nil)),
		Switch:   killswitch.New(true),
	}
}

func askRequestFor(question string) *http.Request {
	body := strings.NewReader(`{"question":"` + question + `"}`)
	r := httptest.NewRequest(http.MethodPost, "/chat/bot", body)
	r.Header.Set("Cf-Connecting-Ip", testClientIP)
	return r
}

func TestBotHandlerStreamChu(t *testing.T) {
	asker := &fakeAsker{chunks: []string{"co ", "5 san pham"}}
	recorder := httptest.NewRecorder()

	botHandler(testDeps(t, asker))(recorder, askRequestFor("co dien thoai nao khong"))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, mong doi 200", recorder.Code)
	}
	body := recorder.Body.String()
	for _, want := range []string{"event: meta", "event: text", "event: done", "5 san pham"} {
		if !strings.Contains(body, want) {
			t.Errorf("body thieu %q:\n%s", want, body)
		}
	}
}

func TestBotHandlerTatBotTra503(t *testing.T) {
	deps := testDeps(t, &fakeAsker{})
	deps.Switch = killswitch.New(false)
	recorder := httptest.NewRecorder()

	botHandler(deps)(recorder, askRequestFor("co dien thoai nao khong"))

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, mong doi 503", recorder.Code)
	}
	var body errorBody
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("doc body loi: %v", err)
	}
	if body.Reason != "bot_disabled" {
		t.Errorf("reason = %q, mong doi bot_disabled", body.Reason)
	}
}

func TestBotHandlerHetLuotTra429KemRetryAfter(t *testing.T) {
	deps := testDeps(t, &fakeAsker{chunks: []string{"xin chao"}})

	// GuestDaily=2: hai cau dau qua, cau thu ba bi chan. Moi cau mot noi dung khac nhau de
	// khong dinh cache.
	for i, question := range []string{"cau mot", "cau hai"} {
		recorder := httptest.NewRecorder()
		botHandler(deps)(recorder, askRequestFor(question))
		if recorder.Code != http.StatusOK {
			t.Fatalf("cau %d: status = %d, mong doi 200", i+1, recorder.Code)
		}
	}

	recorder := httptest.NewRecorder()
	botHandler(deps)(recorder, askRequestFor("cau ba"))

	if recorder.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, mong doi 429", recorder.Code)
	}
	if recorder.Header().Get("Retry-After") == "" {
		t.Error("thieu header Retry-After")
	}
	var body errorBody
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("doc body loi: %v", err)
	}
	if body.Reason != string(quota.ReasonGuestDaily) {
		t.Errorf("reason = %q, mong doi %q", body.Reason, quota.ReasonGuestDaily)
	}
}

func TestBotHandlerCacheHitKhongGoiModelVaKhongTonLuot(t *testing.T) {
	asker := &fakeAsker{chunks: []string{"cau tra loi"}}
	deps := testDeps(t, asker)

	first := httptest.NewRecorder()
	botHandler(deps)(first, askRequestFor("cau hoi giong nhau"))

	second := httptest.NewRecorder()
	botHandler(deps)(second, askRequestFor("cau hoi giong nhau"))

	if asker.calls != 1 {
		t.Fatalf("goi model %d lan, mong doi 1 - lan hai phai lay tu cache", asker.calls)
	}
	if !strings.Contains(second.Body.String(), "cau tra loi") {
		t.Error("lan hai phai van tra ve noi dung")
	}
	// Cache hit khong tinh luot: han muc ton tai de bao ve quota Gemini, ma lan nay khong goi
	// Gemini. Con lai 1 luot nen cau hoi MOI van phai qua duoc.
	third := httptest.NewRecorder()
	botHandler(deps)(third, askRequestFor("cau hoi khac han"))
	if third.Code != http.StatusOK {
		t.Errorf("status = %d, mong doi 200 - cache hit dang bi tinh luot", third.Code)
	}
}

// Cache hit khong tinh luot NHUNG van phai qua co dang-chay: moi cache hit van la mot loat lenh
// ghi xuong DB, va day la duong duy nhat trong service khong co tran neu bo cua nay.
func TestBotHandlerCacheHitVanQuaCoDangChay(t *testing.T) {
	deps := testDeps(t, &fakeAsker{chunks: []string{"cau tra loi"}})

	// Nap cache bang mot lan hoi that.
	warmup := httptest.NewRecorder()
	botHandler(deps)(warmup, askRequestFor("cau hoi giong nhau"))
	if warmup.Code != http.StatusOK {
		t.Fatalf("nap cache that bai: status = %d", warmup.Code)
	}

	// Giu co cua chinh subject do, mo phong mot tab khac dang chay do.
	release, decision := deps.Limiter.Reserve(quota.Subject{IP: testClientIP})
	if !decision.Allowed {
		t.Fatalf("khong gianh duoc co: %s", decision.Reason)
	}
	defer release()

	blocked := httptest.NewRecorder()
	botHandler(deps)(blocked, askRequestFor("cau hoi giong nhau"))

	if blocked.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, mong doi 429 - nhanh cache dang di vong qua co dang-chay", blocked.Code)
	}
	var body errorBody
	if err := json.Unmarshal(blocked.Body.Bytes(), &body); err != nil {
		t.Fatalf("doc body loi: %v", err)
	}
	if body.Reason != string(quota.ReasonInFlight) {
		t.Errorf("reason = %q, mong doi %q", body.Reason, quota.ReasonInFlight)
	}
}

func TestBotHandlerTokenHongTra401(t *testing.T) {
	recorder := httptest.NewRecorder()
	r := askRequestFor("co dien thoai nao khong")
	r.Header.Set("Authorization", "Bearer "+signedToken(t, testSubjectUserID, -time.Minute))

	botHandler(testDeps(t, &fakeAsker{}))(recorder, r)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, mong doi 401 - token het han dang bi tut xuong khach", recorder.Code)
	}
}

func TestBotHandlerCauHoiRongTra400(t *testing.T) {
	recorder := httptest.NewRecorder()

	botHandler(testDeps(t, &fakeAsker{}))(recorder, askRequestFor(""))

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, mong doi 400", recorder.Code)
	}
}

func TestBotHandlerLoiModelDiBangEventError(t *testing.T) {
	asker := &fakeAsker{err: bot.ErrCircuitOpen}
	recorder := httptest.NewRecorder()

	botHandler(testDeps(t, asker))(recorder, askRequestFor("co dien thoai nao khong"))

	// Stream da mo nen status VAN la 200: doi status luc nay la khong the, byte dau da bay di.
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, mong doi 200 (loi di bang event, khong doi status)", recorder.Code)
	}
	body := recorder.Body.String()
	if !strings.Contains(body, "event: error") || !strings.Contains(body, "bot_unavailable") {
		t.Errorf("mong doi event: error kem ma bot_unavailable, nhan:\n%s", body)
	}
}

func TestCacheableChiChoCauMoDau(t *testing.T) {
	traLoiTot := bot.Result{Text: "co 5 san pham"}
	lichSu := []bot.Turn{{Role: bot.RoleUser, Text: "cau hoi truoc do"}}

	cases := []struct {
		name    string
		result  bot.Result
		history []bot.Turn
		want    bool
	}{
		{name: "cau mo dau", result: traLoiTot, history: nil, want: true},
		// Cau tra loi nay sinh ra kem ngu canh nen khong dung chung duoc: cacheKey khong bam
		// lich su, ai hoi trung cau se nhan ngu canh cua nguoi khac.
		{name: "co lich su", result: traLoiTot, history: lichSu, want: false},
		{name: "tra loi rong", result: bot.Result{}, history: nil, want: false},
		{name: "bi cat giua chung", result: bot.Result{Text: "co 5", Truncated: true}, history: nil, want: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := cacheable(tc.result, tc.history); got != tc.want {
				t.Errorf("cacheable = %v, mong doi %v", got, tc.want)
			}
		})
	}
}

// Day la nhanh ma Reserve mot minh khong chan duoc: cac request khong chong len nhau.
func TestBotHandlerBurstChanVongLapTuanTu(t *testing.T) {
	asker := &fakeAsker{chunks: []string{"cau tra loi"}}
	deps := testDeps(t, asker)
	// Gao 1 token, nap lai mot tieng moi duoc mot: request thu hai chac chan bi chan.
	deps.Burst = quota.NewBurst(1, time.Hour)

	first := httptest.NewRecorder()
	botHandler(deps)(first, askRequestFor("cau hoi mot"))
	if first.Code != http.StatusOK {
		t.Fatalf("cau dau: status = %d, mong doi 200", first.Code)
	}

	second := httptest.NewRecorder()
	botHandler(deps)(second, askRequestFor("cau hoi hai"))

	if second.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, mong doi 429", second.Code)
	}
	var body errorBody
	if err := json.Unmarshal(second.Body.Bytes(), &body); err != nil {
		t.Fatalf("doc body loi: %v", err)
	}
	if body.Reason != string(quota.ReasonBurst) {
		t.Errorf("reason = %q, mong doi %q", body.Reason, quota.ReasonBurst)
	}
	if asker.calls != 1 {
		t.Errorf("goi model %d lan, mong doi 1 - request bi chan van di toi model", asker.calls)
	}
}

// Burst phai dung TRUOC cache: dung sau thi mot vong lap bam lai cau da co trong cache van di
// thang xuong DB, dung cai lo ma no sinh ra de va.
func TestBotHandlerBurstChanCaNhanhCacheHit(t *testing.T) {
	deps := testDeps(t, &fakeAsker{chunks: []string{"cau tra loi"}})
	// Dat gao 1 token TRUOC khi nap cache: lan nap tieu dung token do, nen lan hoi lai - lan se
	// trung cache - khong con token nao.
	deps.Burst = quota.NewBurst(1, time.Hour)

	warmup := httptest.NewRecorder()
	botHandler(deps)(warmup, askRequestFor("cau hoi giong nhau"))
	if warmup.Code != http.StatusOK {
		t.Fatalf("nap cache that bai: status = %d", warmup.Code)
	}

	blocked := httptest.NewRecorder()
	botHandler(deps)(blocked, askRequestFor("cau hoi giong nhau"))

	if blocked.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, mong doi 429 - Burst dang dung SAU cache", blocked.Code)
	}
}

// Tran global vo la LY DO TON TAI cua kill switch tu dong: cau tiep theo phai bi chan o cong dau
// chu khong di het duong roi moi bi Limiter tu choi lan nua.
func TestTranGlobalVoThiCamCoKillSwitch(t *testing.T) {
	asker := &fakeAsker{chunks: []string{"xong"}}
	deps := testDeps(t, asker)

	// GlobalDaily 1: cau dau di lot, cau thu hai cham tran.
	limits := quota.Limits{GuestDaily: 100, UserDaily: 100, UserHourly: 100, GlobalDaily: 1}
	deps.Limiter = quota.NewLimiter(&fakeUsageCounter{}, limits)

	botHandler(deps)(httptest.NewRecorder(), askRequestFor("cau thu nhat"))

	if !deps.Switch.Enabled() {
		t.Fatal("moi het mot cau dau, kill switch chua duoc phep cam")
	}

	botHandler(deps)(httptest.NewRecorder(), askRequestFor("cau thu hai"))

	if deps.Switch.Enabled() {
		t.Error("tran global da vo ma kill switch van bat")
	}

	// Va cau thu ba phai chet ngay o cong dau voi ma khac han 429 cua han muc.
	recorder := httptest.NewRecorder()
	botHandler(deps)(recorder, askRequestFor("cau thu ba"))

	if recorder.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, mong doi 503", recorder.Code)
	}
}
