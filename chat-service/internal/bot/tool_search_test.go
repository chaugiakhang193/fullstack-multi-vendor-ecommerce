package bot

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

const testFrontendURL = "https://shop.example.com"

// newToolServer dung SearchTool tro vao mot httptest.Server thay cho search-service that.
func newToolServer(t *testing.T, handler http.HandlerFunc) *SearchTool {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return NewSearchTool(server.URL, testFrontendURL, testLogger())
}

func TestExecuteDoiKetQuaThanhPayloadChoModel(t *testing.T) {
	tool := newToolServer(t, func(w http.ResponseWriter, r *http.Request) {
		// productId dung dang UUID that chu khong phai "p1": no di thang vao duoi duong dan
		// san pham, va ben FE co regex chi nhan UUID o vi tri do.
		_, _ = io.WriteString(w, `{"items":[{"productId":"f7fbe0a9-4820-451e-a72a-8d0b78869d4f","name":"Dien thoai A","slug":"dien-thoai-a","price":4990000}],"total":3}`)
	})

	payload, _ := tool.Execute(context.Background(), map[string]any{"query": "dien thoai"})

	if payload["error"] != nil {
		t.Fatalf("payload co error: %v", payload["error"])
	}
	products, ok := payload["products"].([]any)
	if !ok || len(products) != 1 {
		t.Fatalf("products = %v, muon dung 1 phan tu", payload["products"])
	}

	product, ok := products[0].(map[string]any)
	if !ok {
		t.Fatalf("phan tu products khong phai map: %T", products[0])
	}
	if got := product["priceText"]; got != "4.990.000₫" {
		t.Errorf("priceText = %v, muon 4.990.000₫", got)
	}
	// Hau to "-i.<uuid>" la bat buoc: route storefront la /products/<slug>-i.<uuid> va trang
	// chi tiet moc UUID ra tu duoi duong dan de tra san pham. Bo hau to thi link van bam duoc
	// nhung luon ra "khong tim thay san pham".
	wantURL := testFrontendURL + "/products/dien-thoai-a-i.f7fbe0a9-4820-451e-a72a-8d0b78869d4f"
	if got := product["url"]; got != wantURL {
		t.Errorf("url = %v, muon %v", got, wantURL)
	}
	// description khong duoc co mat du search-service co lo tra ve: payload chi mang dung
	// bon truong da chon.
	if _, has := product["description"]; has {
		t.Error("payload lot truong description")
	}
	if got := payload["total"]; got != int64(3) {
		t.Errorf("total = %v (%T), muon 3", got, got)
	}
	if payload["note"] == nil {
		t.Error("payload thieu note nhac model coi ket qua la du lieu")
	}
}

// Model cho so duoi dang float64 (JSON) hoac chuoi; ca hai deu phai thanh tham so loc gia.
func TestExecuteGuiKhoangGiaXuongSearchService(t *testing.T) {
	cases := []struct {
		name string
		args map[string]any
		want string
	}{
		{"so float64", map[string]any{"query": "dien thoai", "maxPrice": float64(5000000)}, "max_price=5000000"},
		{"chuoi so", map[string]any{"query": "dien thoai", "maxPrice": "5000000"}, "max_price=5000000"},
		{"gia toi thieu", map[string]any{"query": "dien thoai", "minPrice": float64(1000000)}, "min_price=1000000"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var rawQuery string
			tool := newToolServer(t, func(w http.ResponseWriter, r *http.Request) {
				rawQuery = r.URL.RawQuery
				_, _ = io.WriteString(w, `{"items":[],"total":0}`)
			})

			_, _ = tool.Execute(context.Background(), tc.args)

			if !strings.Contains(rawQuery, tc.want) {
				t.Errorf("query = %q, muon chua %q", rawQuery, tc.want)
			}
		})
	}
}

// Gia tri rac o tham so gia phai bi BO, khong duoc gui xuong: gui xuong thi search-service
// coi nhu khong loc, va nguoi dung hoi "duoi 5 trieu" lai nhan ve hang 20 trieu.
func TestExecuteBoQuaKhoangGiaKhongDocDuoc(t *testing.T) {
	var rawQuery string
	tool := newToolServer(t, func(w http.ResponseWriter, r *http.Request) {
		rawQuery = r.URL.RawQuery
		_, _ = io.WriteString(w, `{"items":[],"total":0}`)
	})

	_, _ = tool.Execute(context.Background(), map[string]any{"query": "dien thoai", "maxPrice": "khoang 5 trieu"})

	if strings.Contains(rawQuery, "max_price") {
		t.Errorf("query = %q, khong duoc co max_price khi gia tri khong doc duoc", rawQuery)
	}
}

// Cap 5 kiem lai o phia doc: search-service lo noi cap len thi bot van chi nhin 5 dong.
func TestExecuteCatConNamSanPham(t *testing.T) {
	tool := newToolServer(t, func(w http.ResponseWriter, r *http.Request) {
		items := make([]string, 0, 8)
		for i := 0; i < 8; i++ {
			items = append(items, fmt.Sprintf(`{"productId":"p%d","name":"San pham","slug":"sp-%d","price":1000}`, i, i))
		}
		_, _ = io.WriteString(w, `{"items":[`+strings.Join(items, ",")+`],"total":8}`)
	})

	payload, _ := tool.Execute(context.Background(), map[string]any{"query": "san pham"})

	products, _ := payload["products"].([]any)
	if len(products) != 5 {
		t.Fatalf("so product = %d, muon 5", len(products))
	}
}

func TestExecuteTraPayloadLoiThayViError(t *testing.T) {
	cases := []struct {
		name        string
		handler     http.HandlerFunc
		muonOutcome ToolOutcome
	}{
		{"search tra 500", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		}, OutcomeHTTP5xx},
		{"body khong phai JSON", func(w http.ResponseWriter, r *http.Request) {
			_, _ = io.WriteString(w, `<html>bad gateway</html>`)
		}, OutcomeDecodeError},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tool := newToolServer(t, tc.handler)

			payload, diagnostic := tool.Execute(context.Background(), map[string]any{"query": "dien thoai"})

			if payload["error"] == nil {
				t.Fatal("muon payload co truong error")
			}
			if diagnostic.Outcome != tc.muonOutcome {
				t.Errorf("outcome = %q, muon %q", diagnostic.Outcome, tc.muonOutcome)
			}
			// products phai co mat va rong: model doc mot hinh dang duy nhat cho moi truong hop.
			products, ok := payload["products"].([]any)
			if !ok || len(products) != 0 {
				t.Errorf("products = %v, muon mang rong", payload["products"])
			}
		})
	}
}

func TestExecuteThieuQueryThiKhongGoiMang(t *testing.T) {
	called := false
	tool := newToolServer(t, func(w http.ResponseWriter, r *http.Request) {
		called = true
	})

	payload, diagnostic := tool.Execute(context.Background(), map[string]any{})

	if payload["error"] == nil {
		t.Fatal("muon payload co truong error")
	}
	if diagnostic.Outcome != OutcomeInvalidInput {
		t.Errorf("outcome = %q, muon %q", diagnostic.Outcome, OutcomeInvalidInput)
	}
	if called {
		t.Error("da goi search-service du thieu tu khoa")
	}
}

func TestFormatVND(t *testing.T) {
	cases := []struct {
		in   int64
		want string
	}{
		{0, "0₫"},
		{999, "999₫"},
		{1000, "1.000₫"},
		{4990000, "4.990.000₫"},
		{123456789, "123.456.789₫"},
	}

	for _, tc := range cases {
		if got := FormatVND(tc.in); got != tc.want {
			t.Errorf("FormatVND(%d) = %q, muon %q", tc.in, got, tc.want)
		}
	}
}

// safeBuffer cho phep test doc buffer trong khi goroutine cua Warm() con dang ghi.
type safeBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *safeBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *safeBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

// newBufferLogger tra ve mot logger JSON ghi vao buffer doc duoc.
//
// JSON chu khong phai text, va doc theo record chu khong do chuoi tren ca buffer: buffer
// chua CA hai dong "chay tool" va "danh thuc search", ma hai dong do dung chung ten truong
// statusCode va latencyMs. Do chuoi thi mot truong thieu o dong nay van duoc dong kia lam
// cho xanh - dung kieu am tinh ma bo phan loai nay ton tai de chong.
//
// level de goi duoc ca nhanh DEBUG cua Warmer.
func newBufferLogger(level slog.Level) (*slog.Logger, *safeBuffer) {
	buf := &safeBuffer{}
	return slog.New(slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: level})), buf
}

// timDongLog tra ve record dau tien co truong msg khop, hoac nil neu chua co.
func timDongLog(buf *safeBuffer, msg string) map[string]any {
	for _, dong := range strings.Split(buf.String(), "\n") {
		if strings.TrimSpace(dong) == "" {
			continue
		}
		var record map[string]any
		if err := json.Unmarshal([]byte(dong), &record); err != nil {
			continue
		}
		if record["msg"] == msg {
			return record
		}
	}
	return nil
}

// choDongLog cho toi khi co mot record voi msg do, hoac het han.
//
// Day la phep cho KHANG DINH DUONG - no cho mot su kien se den. Khong dung ky thuat nay de
// chung minh mot su kien KHONG bao gio den: ngu mot khoang roi ket luan chi la giam xac
// suat, khong phai bang chung.
func choDongLog(t *testing.T, buf *safeBuffer, msg string) map[string]any {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if record := timDongLog(buf, msg); record != nil {
			return record
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("khong thay dong log %q sau 2s. Log hien co:\n%s", msg, buf.String())
	return nil
}

// urlChet dung mot httptest.Server roi dong ngay, tra ve URL da chet cua no.
//
// Chac chan hon "127.0.0.1:1": khong co gi bao dam cong 1 luon dong tren moi may, con mot
// server vua dong thi chac chan khong ai nghe.
func urlChet(t *testing.T) string {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	url := server.URL
	server.Close()
	return url
}

func TestExecutePhanLoaiTheoStatus(t *testing.T) {
	cases := []struct {
		ten      string
		status   int
		body     string
		muonOut  ToolOutcome
		muonWarm bool
	}{
		{"200 doc duoc", 200, `{"items":[],"total":0}`, OutcomeSuccess, false},
		{"200 body la html", 200, `<html>loading</html>`, OutcomeDecodeError, false},
		{"404", 404, `{}`, OutcomeHTTP4xx, false},
		{"429", 429, `{}`, OutcomeHTTP4xx, false},
		{"500", 500, `{}`, OutcomeHTTP5xx, true},
		{"503", 503, `{}`, OutcomeHTTP5xx, true},
		{"204 khac 200", 204, ``, OutcomeHTTPOther, false},
		{"302 khong co Location", 302, ``, OutcomeHTTPOther, false},
	}

	for _, tc := range cases {
		t.Run(tc.ten, func(t *testing.T) {
			tool := newToolServer(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = io.WriteString(w, tc.body)
			})

			_, diagnostic := tool.Execute(context.Background(), map[string]any{"query": "laptop"})

			if diagnostic.Outcome != tc.muonOut {
				t.Errorf("outcome = %q, muon %q", diagnostic.Outcome, tc.muonOut)
			}
			if diagnostic.StatusCode != tc.status {
				t.Errorf("statusCode = %d, muon %d", diagnostic.StatusCode, tc.status)
			}
			if got := tc.muonOut.shouldWarm(); got != tc.muonWarm {
				t.Errorf("shouldWarm() = %v, muon %v", got, tc.muonWarm)
			}
		})
	}
}

// TestExecutePhanLoaiLoiDo chay bon nhanh loi cua http.Client.Do qua chinh Execute, voi
// loi that chu khong phai loi gia: cai can ghim la hanh vi cua Go va cua otelhttp, khong
// phai hanh vi cua mot struct ta tu viet.
func TestExecutePhanLoaiLoiDo(t *testing.T) {
	// handlerTreo chan moi request de ep timeout - TRU /health.
	//
	// Bat buoc phai tach /health ra: mot outcome timeout keo theo Warm(), cu poke di vao
	// chinh server nay, va neu no cung bi chan thi goroutine song toi warmTimeout=90s trong
	// khi t.Cleanup(server.Close) doi request do ket thuc. Treo ca bo test.
	handlerTreo := func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			w.WriteHeader(http.StatusOK)
			return
		}
		<-r.Context().Done()
	}

	t.Run("client_timeout khong roi xuong transport_timeout", func(t *testing.T) {
		tool := newToolServer(t, handlerTreo)
		// Test nam cung package nen ha duoc tran xuong 50ms. Khong ai ngoi 20 giay cho mot
		// test, va di qua Execute thi kiem luon otelhttp, diagnostic va quyet dinh Warm().
		tool.http.Timeout = 50 * time.Millisecond

		_, diagnostic := tool.Execute(context.Background(), map[string]any{"query": "laptop"})

		if diagnostic.Outcome != OutcomeClientTimeout {
			t.Fatalf("outcome = %q, muon %q. Client.Timeout khong unwrap ve context.DeadlineExceeded "+
				"tren Go nay: PHAI sua lai cach phan loai, KHONG duoc doi expectation cua test",
				diagnostic.Outcome, OutcomeClientTimeout)
		}
		if diagnostic.StatusCode != 0 {
			t.Errorf("statusCode = %d, muon 0 khi khong co response", diagnostic.StatusCode)
		}
	})

	t.Run("context_deadline khi ngan sach cha het", func(t *testing.T) {
		tool := newToolServer(t, handlerTreo)

		ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
		defer cancel()

		_, diagnostic := tool.Execute(ctx, map[string]any{"query": "laptop"})

		if diagnostic.Outcome != OutcomeContextDeadline {
			t.Fatalf("outcome = %q, muon %q", diagnostic.Outcome, OutcomeContextDeadline)
		}
	})

	t.Run("canceled khi client bo di", func(t *testing.T) {
		tool := newToolServer(t, handlerTreo)

		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		_, diagnostic := tool.Execute(ctx, map[string]any{"query": "laptop"})

		if diagnostic.Outcome != OutcomeCanceled {
			t.Fatalf("outcome = %q, muon %q", diagnostic.Outcome, OutcomeCanceled)
		}
	})

	t.Run("transport_error khi khong ai nghe", func(t *testing.T) {
		// Mot server vua dong: connection refused, mot loi that o tang ket noi.
		tool := NewSearchTool(urlChet(t), testFrontendURL, testLogger())

		_, diagnostic := tool.Execute(context.Background(), map[string]any{"query": "laptop"})

		if diagnostic.Outcome != OutcomeTransportError {
			t.Fatalf("outcome = %q, muon %q", diagnostic.Outcome, OutcomeTransportError)
		}
	})
}

// TestExecutePhanLoaiLoiDocBody ghim lo hong de bo sot nhat cua ca bo phan loai:
// http.Client.Timeout KHONG dung lai o Do(), dong ho chay tiep va cat ngang luc doc
// Response.Body. Ba nhan cua pha body deu phai duoc chung minh bang loi THAT do Go tra ve,
// khong phai bang suy doan ve error chain.
//
// Ca ba ca dung chung mo hinh: header 200 -> flush mot doan JSON hop le -> giu body. Decode
// doi them byte roi hong vi ngat quang, khong phai vi dinh dang.
func TestExecutePhanLoaiLoiDocBody(t *testing.T) {
	// handlerBodyTreo bao qua daFlush ngay sau khi header da ra day, de test biet luc nao
	// Decode that su bat dau doc.
	//
	// /health van tach rieng du ca ba ca duoi deu co shouldWarm=false: neu phan loai HONG va
	// tra ve mot outcome co Warm, cu poke se di vao chinh server nay roi treo toi
	// warmTimeout=90s. Guard nay bao ve dung luc test that bai, tuc luc can nhat.
	handlerBodyTreo := func(daFlush chan struct{}) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/health" {
				w.WriteHeader(http.StatusOK)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(w, `{"items":[`)
			w.(http.Flusher).Flush()
			if daFlush != nil {
				close(daFlush)
			}
			<-r.Context().Done()
		}
	}

	kiem := func(t *testing.T, diagnostic ToolDiagnostic, muon ToolOutcome) {
		t.Helper()
		if diagnostic.Outcome != muon {
			t.Fatalf("outcome = %q, muon %q. Neu ra decode_error thi loi doc body khong unwrap "+
				"nhu classifyBodyError gia dinh tren Go nay: PHAI sua lai cach phan loai, "+
				"KHONG duoc doi expectation cua test", diagnostic.Outcome, muon)
		}
		if diagnostic.StatusCode != http.StatusOK {
			t.Errorf("statusCode = %d, muon 200 - header da ve truoc khi body hong", diagnostic.StatusCode)
		}
		if diagnostic.Outcome.shouldWarm() {
			t.Error("pha body khong duoc Warm: khong nhanh nao trong pha nay duoc goi Warm")
		}
	}

	t.Run("body_timeout khi tran client ban", func(t *testing.T) {
		tool := newToolServer(t, handlerBodyTreo(nil))
		// 250ms chu khong phai 50ms: header phai kip ra day trong quang do ke ca tren may cham.
		tool.http.Timeout = 250 * time.Millisecond

		_, diagnostic := tool.Execute(context.Background(), map[string]any{"query": "laptop"})

		kiem(t, diagnostic, OutcomeBodyTimeout)
	})

	t.Run("body_context_deadline khi ngan sach cha het", func(t *testing.T) {
		tool := newToolServer(t, handlerBodyTreo(nil))
		// KHONG ha tool.http.Timeout: de nguyen 20s thi ctx chac chan het han truoc, va do
		// dung la thu can phan biet.

		ctx, cancel := context.WithTimeout(context.Background(), 250*time.Millisecond)
		defer cancel()

		_, diagnostic := tool.Execute(ctx, map[string]any{"query": "laptop"})

		kiem(t, diagnostic, OutcomeBodyContextDeadline)
	})

	t.Run("body_canceled khi client bo di giua chung", func(t *testing.T) {
		daFlush := make(chan struct{})
		tool := newToolServer(t, handlerBodyTreo(daFlush))

		ctx, huy := context.WithCancel(context.Background())
		defer huy()

		go func() {
			<-daFlush
			// daFlush chi chung minh SERVER da flush, chua chung minh Decode da bat dau doc.
			// Nhip ngu nay la heuristic bu vao khoang trong do, khong phai mot bao dam.
			//
			// No khong the tao xanh gia: huy qua som thi loi roi vao chinh Do() va ra
			// OutcomeCanceled, tuc test DO.
			time.Sleep(100 * time.Millisecond)
			huy()
		}()

		_, diagnostic := tool.Execute(ctx, map[string]any{"query": "laptop"})

		kiem(t, diagnostic, OutcomeBodyCanceled)
	})
}

// TestExecuteRequestErrorKhiURLHong ghim nhanh duy nhat khong di ra mang.
func TestExecuteRequestErrorKhiURLHong(t *testing.T) {
	// Ky tu dieu khien trong URL lam url.Parse tu choi, nen NewRequestWithContext loi truoc
	// khi co bat cu ket noi nao.
	tool := NewSearchTool("http://127.0.0.1\x7f", testFrontendURL, testLogger())

	payload, diagnostic := tool.Execute(context.Background(), map[string]any{"query": "laptop"})

	if diagnostic.Outcome != OutcomeRequestError {
		t.Fatalf("outcome = %q, muon %q", diagnostic.Outcome, OutcomeRequestError)
	}
	if payload["error"] != "khong goi duoc he thong tim kiem" {
		t.Errorf("payload error = %v, muon cau cu", payload["error"])
	}
}

// TestExecuteQueryToanKhoangTrangTraInvalidInput bo sung nhanh con lai cua ma tran.
// Khac TestExecuteThieuQueryThiKhongGoiMang o cho query co mat nhung rong sau TrimSpace.
func TestExecuteQueryToanKhoangTrangTraInvalidInput(t *testing.T) {
	tool := NewSearchTool(urlChet(t), testFrontendURL, testLogger())

	_, diagnostic := tool.Execute(context.Background(), map[string]any{"query": "   "})

	if diagnostic.Outcome != OutcomeInvalidInput {
		t.Fatalf("outcome = %q, muon %q", diagnostic.Outcome, OutcomeInvalidInput)
	}
}

// netErrGia hien thuc net.Error. Chi dung cho transport_timeout: mot handshake TLS qua han
// khong dung duoc trong unit test, va day la nhanh duy nhat phai dung loi gia.
type netErrGia struct{ timeout bool }

func (e netErrGia) Error() string   { return "loi mang gia lap" }
func (e netErrGia) Timeout() bool   { return e.timeout }
func (e netErrGia) Temporary() bool { return false }

func TestClassifyDoErrorTransportTimeout(t *testing.T) {
	cases := []struct {
		ten  string
		err  error
		muon ToolOutcome
	}{
		{"net.Error co timeout", netErrGia{timeout: true}, OutcomeTransportTimeout},
		{"net.Error khong timeout", netErrGia{timeout: false}, OutcomeTransportError},
		{"loi thuong", errors.New("connection reset by peer"), OutcomeTransportError},
	}

	for _, tc := range cases {
		t.Run(tc.ten, func(t *testing.T) {
			if got := classifyDoError(context.Background(), tc.err); got != tc.muon {
				t.Errorf("outcome = %q, muon %q", got, tc.muon)
			}
		})
	}
}

// TestShouldWarmGhimBangQuyetDinh ghim quyet dinh danh thuc cho MOI outcome hien biet.
//
// Day KHONG phai exhaustiveness guard: ToolOutcome la string constant nen Go khong ep duoc
// o muc bien dich, va them mot hang moi ma quen ca hai cho o day thi test van xanh. No chi
// bao dam khong ai lang le doi quyet dinh cua mot outcome DA CO.
func TestShouldWarmGhimBangQuyetDinh(t *testing.T) {
	cases := []struct {
		outcome ToolOutcome
		muon    bool
	}{
		{OutcomeSuccess, false},
		{OutcomeInvalidInput, false},
		{OutcomeRequestError, false},
		{OutcomeCanceled, false},
		{OutcomeContextDeadline, true},
		{OutcomeClientTimeout, true},
		{OutcomeTransportTimeout, true},
		{OutcomeTransportError, true},
		{OutcomeHTTP4xx, false},
		{OutcomeHTTP5xx, true},
		{OutcomeHTTPOther, false},
		// Ca bon ket cuc pha body: false, khong nhanh nao trong pha nay duoc goi Warm.
		{OutcomeBodyCanceled, false},
		{OutcomeBodyContextDeadline, false},
		{OutcomeBodyTimeout, false},
		{OutcomeDecodeError, false},
	}

	for _, tc := range cases {
		t.Run(string(tc.outcome), func(t *testing.T) {
			if got := tc.outcome.shouldWarm(); got != tc.muon {
				t.Errorf("shouldWarm() = %v, muon %v", got, tc.muon)
			}
		})
	}
}

// TestRunToolLogDuTruongVaKhongLoQuery nghiem thu SAN PHAM cua thay doi nay: dong log.
//
// Hai thu lot qua moi test khac neu khong co day: quen mot truong, va ghi sai outcome.
func TestRunToolLogDuTruongVaKhongLoQuery(t *testing.T) {
	const tuKhoaBiMat = "laptop-sinh-vien-bi-mat"

	logger, buf := newBufferLogger(slog.LevelInfo)
	tool := newToolServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusServiceUnavailable)
	})
	tool.warmer.logger = logger

	svc := NewService(nil, tool, logger)
	call := ToolCall{Name: ToolSearchProducts, Args: map[string]any{"query": tuKhoaBiMat}}
	svc.runTool(context.Background(), call)

	// Khang dinh tren DUNG record "chay tool", khong do chuoi tren ca buffer: dong
	// "danh thuc search" cung co statusCode va latencyMs, nen mot truong thieu o day van co
	// the duoc dong kia lam cho xanh.
	record := timDongLog(buf, "chay tool")
	if record == nil {
		t.Fatalf("khong co record chay tool. Log:\n%s", buf.String())
	}

	muon := map[string]any{
		"tool":     ToolSearchProducts,
		"hasError": true,
		"outcome":  string(OutcomeHTTP5xx),
	}
	for khoa, giaTri := range muon {
		if record[khoa] != giaTri {
			t.Errorf("chay tool.%s = %v, muon %v", khoa, record[khoa], giaTri)
		}
	}
	// So trong JSON giai ma ra float64.
	if record["statusCode"] != float64(http.StatusServiceUnavailable) {
		t.Errorf("chay tool.statusCode = %v, muon 503", record["statusCode"])
	}
	if _, co := record["latencyMs"]; !co {
		t.Error("chay tool thieu latencyMs")
	}

	// 503 keo mot cu Warm() ra. CHO no ghi xong roi moi chup buffer, de khang dinh duoi day
	// phu CA HAI dong chu khong chi dong dau.
	choDongLog(t, buf, "danh thuc search")

	log := buf.String()
	if strings.Contains(log, tuKhoaBiMat) {
		t.Errorf("log lo tu khoa nguoi dung go. Log:\n%s", log)
	}
	if strings.Contains(log, "q=") {
		t.Errorf("log lo query string. Log:\n%s", log)
	}
}

// TestRunToolKhongLogErrTho la nua con lai cua guard bao mat, va la nua QUAN TRONG hon.
//
// Test tren dung response 503, tuc khong co *url.Error nao duoc sinh ra - no chi chung minh
// call.Args khong lot vao log. Test nay dung mot URL chet de Do() that su tra *url.Error,
// va chinh chuoi Error() cua no moi la thu in ra nguyen URL kem tu khoa.
func TestRunToolKhongLogErrTho(t *testing.T) {
	const tuKhoaBiMat = "laptop-sinh-vien-bi-mat"

	logger, buf := newBufferLogger(slog.LevelInfo)
	tool := NewSearchTool(urlChet(t), testFrontendURL, logger)

	svc := NewService(nil, tool, logger)
	call := ToolCall{Name: ToolSearchProducts, Args: map[string]any{"query": tuKhoaBiMat}}
	svc.runTool(context.Background(), call)

	record := timDongLog(buf, "chay tool")
	if record == nil {
		t.Fatalf("khong co record chay tool. Log:\n%s", buf.String())
	}
	if record["outcome"] != string(OutcomeTransportError) {
		t.Fatalf("outcome = %v, muon %q - test nay chi co nghia khi Do() that su loi",
			record["outcome"], OutcomeTransportError)
	}

	// transport_error co Warm(), nen cho not dong thu hai roi moi chup.
	choDongLog(t, buf, "danh thuc search")

	log := buf.String()
	if strings.Contains(log, tuKhoaBiMat) {
		t.Errorf("err tho da lot vao log kem tu khoa. Log:\n%s", log)
	}
	if strings.Contains(log, "q=") {
		t.Errorf("err tho da lot vao log kem query string. Log:\n%s", log)
	}
}

func TestWarmerLogDuBayNhanh(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		logger, buf := newBufferLogger(slog.LevelInfo)
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		t.Cleanup(server.Close)

		NewWarmer(server.URL, logger).Warm(OutcomeHTTP5xx)

		record := choDongLog(t, buf, "danh thuc search")
		if record["outcome"] != string(warmSuccess) {
			t.Errorf("outcome = %v, muon %q", record["outcome"], warmSuccess)
		}
		if record["trigger"] != string(OutcomeHTTP5xx) {
			t.Errorf("trigger = %v, muon %q", record["trigger"], OutcomeHTTP5xx)
		}
		if record["statusCode"] != float64(http.StatusOK) {
			t.Errorf("statusCode = %v, muon 200", record["statusCode"])
		}
	})

	t.Run("http_non_2xx", func(t *testing.T) {
		logger, buf := newBufferLogger(slog.LevelInfo)
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusBadGateway)
		}))
		t.Cleanup(server.Close)

		NewWarmer(server.URL, logger).Warm(OutcomeTransportError)

		record := choDongLog(t, buf, "danh thuc search")
		if record["outcome"] != string(warmNon2xx) {
			t.Errorf("outcome = %v, muon %q", record["outcome"], warmNon2xx)
		}
		if record["statusCode"] != float64(http.StatusBadGateway) {
			t.Errorf("statusCode = %v, muon 502", record["statusCode"])
		}
	})

	t.Run("transport_error", func(t *testing.T) {
		logger, buf := newBufferLogger(slog.LevelInfo)

		NewWarmer(urlChet(t), logger).Warm(OutcomeHTTP5xx)

		record := choDongLog(t, buf, "danh thuc search")
		if record["outcome"] != string(warmTransport) {
			t.Errorf("outcome = %v, muon %q", record["outcome"], warmTransport)
		}
		if record["statusCode"] != float64(0) {
			t.Errorf("statusCode = %v, muon 0 khi khong co response", record["statusCode"])
		}
	})

	t.Run("request_error khi URL hong", func(t *testing.T) {
		logger, buf := newBufferLogger(slog.LevelInfo)

		// baseURL khac rong nen qua duoc cong, nhung ky tu dieu khien lam url.Parse tu choi
		// nen NewRequestWithContext loi truoc khi co ket noi nao.
		NewWarmer("http://127.0.0.1\x7f", logger).Warm(OutcomeHTTP5xx)

		record := choDongLog(t, buf, "danh thuc search")
		if record["outcome"] != string(warmReqError) {
			t.Errorf("outcome = %v, muon %q", record["outcome"], warmReqError)
		}
	})

	t.Run("suppressed_in_flight", func(t *testing.T) {
		logger, buf := newBufferLogger(slog.LevelInfo)
		thaCua := make(chan struct{})
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			<-thaCua
		}))
		// Tha cua TRUOC khi dong server: httptest.Server.Close() doi request dang chay ket
		// thuc, nen dong truoc khi tha se treo. t.Cleanup chay LIFO.
		t.Cleanup(server.Close)
		t.Cleanup(func() { close(thaCua) })

		warmer := NewWarmer(server.URL, logger)
		// begin() chay DONG BO trong Warm(), nen sau lenh dau poking da la true - khong co
		// race nao phai cho.
		warmer.Warm(OutcomeHTTP5xx)
		warmer.Warm(OutcomeHTTP5xx)

		record := timDongLog(buf, "danh thuc search")
		if record == nil || record["outcome"] != string(warmInFlight) {
			t.Errorf("cu poke thu hai phai bi chan va phai duoc log. Log:\n%s", buf.String())
		}
	})

	t.Run("suppressed_throttled", func(t *testing.T) {
		logger, buf := newBufferLogger(slog.LevelInfo)

		warmer := NewWarmer(urlChet(t), logger)
		// Dat thang lastPoke thay vi chay mot cu poke that: test nam cung package, va cach
		// nay khong phai cho goroutine nao.
		warmer.mu.Lock()
		warmer.lastPoke = time.Now()
		warmer.mu.Unlock()

		warmer.Warm(OutcomeHTTP5xx)

		record := timDongLog(buf, "danh thuc search")
		if record == nil || record["outcome"] != string(warmThrottled) {
			t.Errorf("phai bi throttle chan va phai duoc log. Log:\n%s", buf.String())
		}
	})

	t.Run("suppressed_empty_url o muc DEBUG", func(t *testing.T) {
		logger, buf := newBufferLogger(slog.LevelDebug)

		NewWarmer("", logger).Warm(OutcomeHTTP5xx)

		record := timDongLog(buf, "danh thuc search")
		if record == nil || record["outcome"] != string(warmEmptyURL) {
			t.Errorf("thieu nhanh empty_url. Log:\n%s", buf.String())
		}
	})

	t.Run("empty_url khong hien o muc INFO", func(t *testing.T) {
		logger, buf := newBufferLogger(slog.LevelInfo)

		NewWarmer("", logger).Warm(OutcomeHTTP5xx)

		// Day KHONG phai chung minh mot phu dinh bang cach cho: Warm() ghi dong nay DONG BO
		// roi return, nen sau lenh tren buffer da o trang thai cuoi cung cua no.
		if record := timDongLog(buf, "danh thuc search"); record != nil {
			t.Errorf("nhanh khong toi duoc khong duoc nam o INFO. Log:\n%s", buf.String())
		}
	})
}
