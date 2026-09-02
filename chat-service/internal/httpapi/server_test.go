package httpapi

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/telemetry"
	"github.com/prometheus/client_golang/prometheus/testutil"
)

// statusHandler tra dung mot ma trang thai, khong body.
func statusHandler(status int) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
	})
}

// serveQuaMux goi mot route qua ServeMux that chu khong goi thang handler: r.Pattern chi duoc
// ServeMux dien vao, ma nhan endpoint cua histogram lay tu do.
func serveQuaMux(mux *http.ServeMux, method string, path string) {
	r := httptest.NewRequest(method, path, nil)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, r)
}

func TestMeasuredDemRequestTheoStatus(t *testing.T) {
	metrics := telemetry.GetMetrics()
	servedCounter := metrics.HTTPRequestsTotal.WithLabelValues("200", "served")
	errorCounter := metrics.HTTPRequestsTotal.WithLabelValues("503", "error")

	servedTruoc := testutil.ToFloat64(servedCounter)
	errorTruoc := testutil.ToFloat64(errorCounter)

	mux := http.NewServeMux()
	okRoute := statusHandler(http.StatusOK)
	hongRoute := statusHandler(http.StatusServiceUnavailable)
	mux.Handle("GET /chat/test-ok", instrumented("chat-test-ok-http", okRoute))
	mux.Handle("GET /chat/test-hong", instrumented("chat-test-hong-http", hongRoute))

	serveQuaMux(mux, http.MethodGet, "/chat/test-ok")
	serveQuaMux(mux, http.MethodGet, "/chat/test-hong")

	if got := testutil.ToFloat64(servedCounter) - servedTruoc; got != 1 {
		t.Errorf("counter served tang %v, mong doi 1", got)
	}
	if got := testutil.ToFloat64(errorCounter) - errorTruoc; got != 1 {
		t.Errorf("counter error tang %v, mong doi 1", got)
	}
}

// TestMeasuredDatNhanEndpointTheoPattern scrape /metrics thay vi doc thang collector: thu bi hong
// truoc do la metric co khai bao nhung khong xuat hien o cua scrape, nen phep kiem di het den do.
func TestMeasuredDatNhanEndpointTheoPattern(t *testing.T) {
	mux := http.NewServeMux()
	route := statusHandler(http.StatusOK)
	mux.Handle("GET /chat/test-endpoint", instrumented("chat-test-endpoint-http", route))

	serveQuaMux(mux, http.MethodGet, "/chat/test-endpoint")

	scrapeRequest := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	scrapeRecorder := httptest.NewRecorder()
	telemetry.MetricsHandler().ServeHTTP(scrapeRecorder, scrapeRequest)
	body := scrapeRecorder.Body.String()

	mongDoi := `chat_request_duration_seconds_count{endpoint="GET /chat/test-endpoint"} 1`
	if !strings.Contains(body, mongDoi) {
		t.Errorf("/metrics khong co dong %q", mongDoi)
	}
}

// TestMeasuredGiuFlusherVaHijacker chay tren httptest.NewServer chu khong tren NewRecorder:
// recorder khong implement Hijacker, nen kiem tren recorder se bao mat Hijacker ngay ca khi code
// dung. Tinh chat cua ResponseWriter chi kiem duoc tren server that.
//
// Ket qua ghi vao body chu khong vao bien ngoai: handler chay o goroutine khac voi test.
func TestMeasuredGiuFlusherVaHijacker(t *testing.T) {
	probe := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, isFlusher := w.(http.Flusher)
		_, isHijacker := w.(http.Hijacker)
		fmt.Fprintf(w, "flusher=%t hijacker=%t", isFlusher, isHijacker)
	})

	mux := http.NewServeMux()
	mux.Handle("GET /chat/test-probe", instrumented("chat-test-probe-http", probe))

	server := httptest.NewServer(mux)
	defer server.Close()

	probeURL := server.URL + "/chat/test-probe"
	resp, err := http.Get(probeURL)
	if err != nil {
		t.Fatalf("goi probe loi: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("doc body loi: %v", err)
	}

	mongDoi := "flusher=true hijacker=true"
	if string(body) != mongDoi {
		t.Errorf("probe = %q, mong doi %q - mat Flusher thi SSE /chat/bot hong, mat Hijacker thi bat tay WebSocket hong", body, mongDoi)
	}
}

func TestOutcomeFromStatus(t *testing.T) {
	cases := []struct {
		code    int
		mongDoi string
	}{
		{http.StatusOK, "served"},
		{http.StatusNoContent, "served"},
		{http.StatusNotModified, "served"},
		{http.StatusBadRequest, "client_error"},
		{http.StatusUnauthorized, "client_error"},
		{http.StatusTooManyRequests, "client_error"},
		{http.StatusInternalServerError, "error"},
		{http.StatusServiceUnavailable, "error"},
	}

	for _, c := range cases {
		if got := outcomeFromStatus(c.code); got != c.mongDoi {
			t.Errorf("outcomeFromStatus(%d) = %q, mong doi %q", c.code, got, c.mongDoi)
		}
	}
}
