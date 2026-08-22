package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

const testFrontendURL = "https://shop.example.com"

// okHandler danh dau la da di toi handler that.
func okHandler(reached *bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*reached = true
		w.WriteHeader(http.StatusOK)
	})
}

func TestCORSChoQuaDungGoc(t *testing.T) {
	reached := false
	handler := corsAllowlist(testFrontendURL, okHandler(&reached))

	r := httptest.NewRequest(http.MethodPost, "/chat/bot", nil)
	r.Header.Set("Origin", testFrontendURL)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, r)

	if !reached {
		t.Fatal("goc dung phai di toi handler")
	}
	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != testFrontendURL {
		t.Errorf("Allow-Origin = %q, mong doi %q", got, testFrontendURL)
	}
	if got := recorder.Header().Get("Vary"); got != "Origin" {
		t.Errorf("Vary = %q, mong doi Origin", got)
	}
}

// FRONTEND_URL dat kem dau "/" cuoi la loi go bien moi truong pho bien nhat, va neu khong cat
// thi no lam 403 TOAN BO request tu trinh duyet trong khi cau hinh trong co ve dung.
func TestCORSChoQuaKhiFrontendURLCoDauGachCuoi(t *testing.T) {
	reached := false
	handler := corsAllowlist(testFrontendURL+"/", okHandler(&reached))

	r := httptest.NewRequest(http.MethodPost, "/chat/bot", nil)
	// Trinh duyet khong bao gio gui Origin kem dau "/" cuoi.
	r.Header.Set("Origin", testFrontendURL)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, r)

	if !reached {
		t.Fatalf("status = %d - dau \"/\" cuoi trong FRONTEND_URL dang chan ca storefront", recorder.Code)
	}
}

func TestCORSChanGocLa(t *testing.T) {
	reached := false
	handler := corsAllowlist(testFrontendURL, okHandler(&reached))

	r := httptest.NewRequest(http.MethodPost, "/chat/bot", nil)
	r.Header.Set("Origin", "https://ke-tan-cong.example.com")
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, r)

	if reached {
		t.Fatal("goc la KHONG duoc di toi handler - do la duong tieu quota cua minh tu domain khac")
	}
	if recorder.Code != http.StatusForbidden {
		t.Errorf("status = %d, mong doi 403", recorder.Code)
	}
}

func TestCORSKhongCoOriginThiChoQua(t *testing.T) {
	reached := false
	handler := corsAllowlist(testFrontendURL, okHandler(&reached))

	r := httptest.NewRequest(http.MethodPost, "/chat/bot", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, r)

	if !reached {
		t.Fatal("curl/cron khong gui Origin, phai di qua duoc")
	}
}

func TestCORSPreflightKhongVaoHandler(t *testing.T) {
	reached := false
	handler := corsAllowlist(testFrontendURL, okHandler(&reached))

	r := httptest.NewRequest(http.MethodOptions, "/chat/bot", nil)
	r.Header.Set("Origin", testFrontendURL)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, r)

	if reached {
		t.Fatal("preflight phai tra loi ngay o middleware")
	}
	if recorder.Code != http.StatusNoContent {
		t.Errorf("status = %d, mong doi 204", recorder.Code)
	}
}
