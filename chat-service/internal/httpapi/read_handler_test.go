package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/auth"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/shopclient"
)

// readDeps dung ChatDeps toi thieu ma bon cua dau cua readHandler can.
//
// Store de nil: bon ca trong file nay deu bi tu choi TRUOC khi cham DB, nen chung chay duoc ma
// khong can Postgres. Ca duong thanh cong duoc phu o internal/store, noi da co DB that.
//
// Shops van khac nil du khong cua nao goi toi no: neu mai nay thu tu cac cua doi, mot Shops nil
// se lam test panic thay vi bao thu tu da doi.
func readDeps(t *testing.T) ChatDeps {
	t.Helper()

	verifier, err := auth.NewVerifier(testJWTSecret)
	if err != nil {
		t.Fatalf("NewVerifier loi: %v", err)
	}
	return ChatDeps{
		Shops:    shopclient.New(""),
		Verifier: verifier,
		Logger:   slog.New(slog.NewJSONHandler(io.Discard, nil)),
	}
}

// postRead goi readHandler voi mot body tho, tra ve recorder de kiem status va reason.
func postRead(t *testing.T, body, token string) *httptest.ResponseRecorder {
	t.Helper()

	request := httptest.NewRequest(http.MethodPost, "/chat/read", strings.NewReader(body))
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	recorder := httptest.NewRecorder()
	readHandler(readDeps(t))(recorder, request)
	return recorder
}

func readReason(t *testing.T, recorder *httptest.ResponseRecorder) string {
	t.Helper()

	var body errorBody
	if err := json.NewDecoder(recorder.Body).Decode(&body); err != nil {
		t.Fatalf("decode body loi: %v", err)
	}
	return body.Reason
}

// Khach vang lai khong co chat 1-1 (schema bat hoi thoai direct phai co owner_user_id), nen
// khong co token la 401 chu khong phai tut xuong mot vai nao khac.
func TestReadKhongCoTokenThi401(t *testing.T) {
	recorder := postRead(t, `{"conversationId":"7c9e6679-7425-40de-944b-e07fc1f90ae7"}`, "")

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, mong doi 401", recorder.Code)
	}
	if reason := readReason(t, recorder); reason != "unauthorized" {
		t.Errorf("reason = %q, mong doi %q", reason, "unauthorized")
	}
}

// Token het han tra 401, khong phai 500: het han la chuyen binh thuong, FE refresh roi goi lai.
func TestReadTokenHetHanThi401(t *testing.T) {
	expired := signedToken(t, "7c9e6679-7425-40de-944b-e07fc1f90ae7", -time.Hour)
	recorder := postRead(t, `{"conversationId":"7c9e6679-7425-40de-944b-e07fc1f90ae7"}`, expired)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, mong doi 401", recorder.Code)
	}
}

// Body khong phai JSON tra 400. Ca nay di truoc moi thu cham DB, nen mot request rac khong ton
// mot lenh truy van nao.
func TestReadBodyRacThi400(t *testing.T) {
	token := signedToken(t, "7c9e6679-7425-40de-944b-e07fc1f90ae7", time.Hour)
	recorder := postRead(t, "khong phai json", token)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, mong doi 400", recorder.Code)
	}
	if reason := readReason(t, recorder); reason != "bad_request" {
		t.Errorf("reason = %q, mong doi %q", reason, "bad_request")
	}
}

// Thieu conversationId tra reason RIENG, khong dung chung bad_request: FE goi thieu truong va FE
// goi sai dinh dang la hai loi khac nhau, va nguoi sua chung can biet minh dang o ca nao.
func TestReadThieuConversationIdThi400(t *testing.T) {
	token := signedToken(t, "7c9e6679-7425-40de-944b-e07fc1f90ae7", time.Hour)
	recorder := postRead(t, `{}`, token)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, mong doi 400", recorder.Code)
	}
	if reason := readReason(t, recorder); reason != "missing_conversation" {
		t.Errorf("reason = %q, mong doi %q", reason, "missing_conversation")
	}
}

// Chua cau hinh DB tra 404 chu khong phai 500: khong co store thi khong hoi thoai nao ton tai,
// va do la cung mot cau tra loi ma nguoi khong co quyen nhan duoc.
func TestReadKhongCoStoreThi404(t *testing.T) {
	token := signedToken(t, "7c9e6679-7425-40de-944b-e07fc1f90ae7", time.Hour)
	recorder := postRead(t, `{"conversationId":"7c9e6679-7425-40de-944b-e07fc1f90ae7"}`, token)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, mong doi 404", recorder.Code)
	}
	if reason := readReason(t, recorder); reason != "conversation_not_found" {
		t.Errorf("reason = %q, mong doi %q", reason, "conversation_not_found")
	}
}
