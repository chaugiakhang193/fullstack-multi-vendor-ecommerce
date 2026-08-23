package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/auth"
)

// historyDeps dung BotDeps toi thieu ma historyHandler can: no khong dung Asker, Limiter, Cache
// hay Burst, va Store de nil de test chay duoc khong can Postgres.
func historyDeps(t *testing.T) BotDeps {
	t.Helper()

	verifier, err := auth.NewVerifier(testJWTSecret)
	if err != nil {
		t.Fatalf("NewVerifier loi: %v", err)
	}
	return BotDeps{
		Verifier: verifier,
		Logger:   slog.New(slog.NewJSONHandler(io.Discard, nil)),
	}
}

func decodeHistory(t *testing.T, recorder *httptest.ResponseRecorder) historyResponse {
	t.Helper()

	var body historyResponse
	if err := json.NewDecoder(recorder.Body).Decode(&body); err != nil {
		t.Fatalf("decode body loi: %v", err)
	}
	return body
}

// Store nil = chua cau hinh DB. Phai tra 200 kem mang rong chu khong phai 500: mo widget len van
// phai dung duoc khi phan luu hoi thoai chua san sang.
func TestHistoryKhongCoStoreThiTraMangRong(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/chat/history", nil)
	request.Header.Set(guestKeyHeader, "0d5f4d9e-9d0b-4a3a-9d2f-1f3a6b8c0d2e")

	historyHandler(historyDeps(t))(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, mong doi 200", recorder.Code)
	}
	body := decodeHistory(t, recorder)
	if body.Messages == nil {
		t.Error("messages = null, mong doi mang rong: null bat FE phai kiem them mot truong hop")
	}
	if len(body.Messages) != 0 {
		t.Errorf("len(messages) = %d, mong doi 0", len(body.Messages))
	}
}

// Token hong tra 401 chu khong am tham tut xuong vai khach: nguoi dung dang nhap ma bong dung
// thay lich su trong la thu khong ai doan ra nguyen nhan.
func TestHistoryTokenHongTra401(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/chat/history", nil)
	request.Header.Set("Authorization", "Bearer token.khong.hop.le")

	historyHandler(historyDeps(t))(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, mong doi 401", recorder.Code)
	}
}

// Khach khong gui khoa: khong co gi de tra, nhung cung khong co gi sai.
func TestHistoryKhachKhongCoKhoaThiTraMangRong(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/chat/history", nil)

	historyHandler(historyDeps(t))(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, mong doi 200", recorder.Code)
	}
	if len(decodeHistory(t, recorder).Messages) != 0 {
		t.Error("khach khong co khoa ma van co lich su")
	}
}

// Khoa sai khuon bi resolveSubject bo lang le, y het luc hoi bot. Test nay ghim hanh vi do o
// duong doc: khoa 8 ky tu khong duoc coi la mot chu so huu hop le, va cai nguy hiem la no khong
// bao loi - no chi tra ve rong, dung nhu khoa dung ma chua hoi cau nao.
func TestHistoryKhoaNganBiBoQua(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/chat/history", nil)
	request.Header.Set(guestKeyHeader, "abc12345")

	historyHandler(historyDeps(t))(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, mong doi 200", recorder.Code)
	}
	if len(decodeHistory(t, recorder).Messages) != 0 {
		t.Error("khoa ngan hon minGuestKeyLen ma van tra ve lich su")
	}
}
