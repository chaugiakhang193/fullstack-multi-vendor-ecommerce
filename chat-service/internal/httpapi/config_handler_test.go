package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestConfigTraCoEnabled(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))

	for _, tc := range []struct {
		name    string
		enabled bool
	}{
		{name: "bot dang bat", enabled: true},
		{name: "kill switch dang tat", enabled: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/chat/config", nil)

			configHandler(tc.enabled, logger)(recorder, request)

			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, mong doi 200", recorder.Code)
			}

			var body struct {
				Enabled bool `json:"enabled"`
			}
			if err := json.NewDecoder(recorder.Body).Decode(&body); err != nil {
				t.Fatalf("decode body loi: %v", err)
			}
			if body.Enabled != tc.enabled {
				t.Errorf("enabled = %v, mong doi %v", body.Enabled, tc.enabled)
			}
		})
	}
}

// Cache-Control quan trong ngang chinh gia tri tra ve: kill switch duoc bat len giua su co, ma
// mot ban {"enabled":false} nam trong cache trinh duyet nghia la widget van an sau khi bot da
// bat lai.
func TestConfigKhongChoCache(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/chat/config", nil)

	configHandler(true, logger)(recorder, request)

	if got := recorder.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, mong doi %q", got, "no-store")
	}
}
