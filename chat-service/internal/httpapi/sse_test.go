package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestSSEWriterDatDungHeader(t *testing.T) {
	recorder := httptest.NewRecorder()

	if _, err := newSSEWriter(recorder); err != nil {
		t.Fatalf("newSSEWriter loi: %v", err)
	}

	want := map[string]string{
		"Content-Type":      "text/event-stream",
		"Cache-Control":     "no-cache",
		"X-Accel-Buffering": "no",
	}
	for name, value := range want {
		if got := recorder.Header().Get(name); got != value {
			t.Errorf("header %s = %q, mong doi %q", name, got, value)
		}
	}
}

func TestSSEWriterGhiDungKhuonEvent(t *testing.T) {
	recorder := httptest.NewRecorder()
	writer, err := newSSEWriter(recorder)
	if err != nil {
		t.Fatalf("newSSEWriter loi: %v", err)
	}

	if err := writer.event(eventText, map[string]string{"v": "xin chao"}); err != nil {
		t.Fatalf("ghi event loi: %v", err)
	}

	want := "event: text\ndata: {\"v\":\"xin chao\"}\n\n"
	if got := recorder.Body.String(); got != want {
		t.Errorf("body = %q, mong doi %q", got, want)
	}
}

func TestSSEEventLuonNamTrenMotDong(t *testing.T) {
	recorder := httptest.NewRecorder()
	writer, err := newSSEWriter(recorder)
	if err != nil {
		t.Fatalf("newSSEWriter loi: %v", err)
	}

	// Chu co xuong dong that: neu ghi tho ra day thi client se coi phan sau la mot event khac.
	if err := writer.event(eventText, map[string]string{"v": "dong mot\ndong hai"}); err != nil {
		t.Fatalf("ghi event loi: %v", err)
	}

	body := recorder.Body.String()
	dataLines := 0
	for _, line := range strings.Split(strings.TrimSuffix(body, "\n\n"), "\n") {
		if strings.HasPrefix(line, "data: ") {
			dataLines++
		}
	}
	if dataLines != 1 {
		t.Fatalf("co %d dong data, mong doi 1 - xuong dong trong chu dang lam vo khuon event", dataLines)
	}
}

func TestSSEKeepaliveLaDongComment(t *testing.T) {
	recorder := httptest.NewRecorder()
	writer, err := newSSEWriter(recorder)
	if err != nil {
		t.Fatalf("newSSEWriter loi: %v", err)
	}

	if err := writer.keepalive(); err != nil {
		t.Fatalf("keepalive loi: %v", err)
	}

	if got := recorder.Body.String(); got != ": keepalive\n\n" {
		t.Errorf("body = %q, mong doi dong comment SSE", got)
	}
}

// writerKhongFlush thoa http.ResponseWriter nhung KHONG thoa http.Flusher.
//
// PHAI khai tay ba method chu KHONG duoc nhung *httptest.ResponseRecorder vao: nhung vao la ke
// thua luon ca method Flush() cua no, khi do writerKhongFlush lai thoa Flusher va test duoi day
// xanh oan - no se khong con kiem tra gi ca.
type writerKhongFlush struct {
	header http.Header
}

func (w writerKhongFlush) Header() http.Header         { return w.header }
func (w writerKhongFlush) Write(b []byte) (int, error) { return len(b), nil }
func (w writerKhongFlush) WriteHeader(int)             {}

func TestSSEWriterTuChoiKhiKhongFlushDuoc(t *testing.T) {
	if _, err := newSSEWriter(writerKhongFlush{header: http.Header{}}); err == nil {
		t.Fatal("khong Flush duoc thi khong phai stream, PHAI bao loi")
	}
}

// writerBatGhiChongNhau bao dong khi hai goroutine cung nam trong Write mot luc.
//
// Vi sao khong chi dua vao `go test -race`: race detector chi bat duoc race THUC SU XAY RA
// trong lan chay do, no khong phan tich tinh. Neu khong co test nao cho hai goroutine ghi
// that thi bo mutex di -race van xanh - da kiem va dung nhu vay. Ngoai ra -race doi cgo, khong
// phai may nao cung chay duoc.
//
// Co hieu + mot khoang ngu ngan lam cua so va cham du rong, nen test nay do MOT CACH XAC DINH
// o moi may, con -race la lop kiem thu hai khi CI chay duoc no.
type writerBatGhiChongNhau struct {
	header  http.Header
	dangGhi atomic.Bool
	viPham  atomic.Bool
}

func (w *writerBatGhiChongNhau) Header() http.Header { return w.header }
func (w *writerBatGhiChongNhau) WriteHeader(int)     {}
func (w *writerBatGhiChongNhau) Flush()              {}

func (w *writerBatGhiChongNhau) Write(b []byte) (int, error) {
	if !w.dangGhi.CompareAndSwap(false, true) {
		w.viPham.Store(true)
	}
	// Mot lan ghi xong qua nhanh thi hai goroutine gan nhu khong bao gio gap nhau va test xanh
	// oan; ngu mot chut de cua so du rong.
	time.Sleep(50 * time.Microsecond)
	w.dangGhi.Store(false)
	return len(b), nil
}

// Goi keepalive() thang thay vi cho startKeepalive: ticker 20s khong cho duoc trong test, ma
// thu can do la hai goroutine ghi chung mot ResponseWriter - dung cai startKeepalive tao ra.
func TestSSEWriterKhongCoHaiGoroutineCungGhi(t *testing.T) {
	spy := &writerBatGhiChongNhau{header: http.Header{}}
	writer, err := newSSEWriter(spy)
	if err != nil {
		t.Fatalf("newSSEWriter loi: %v", err)
	}

	const rounds = 200
	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		for i := 0; i < rounds; i++ {
			if err := writer.event(eventText, map[string]string{"v": "chu"}); err != nil {
				return
			}
		}
	}()
	go func() {
		defer wg.Done()
		for i := 0; i < rounds; i++ {
			if err := writer.keepalive(); err != nil {
				return
			}
		}
	}()

	wg.Wait()

	if spy.viPham.Load() {
		t.Fatal("hai goroutine cung ghi mot ResponseWriter - se co ngay mot dong keepalive " +
			"chen vao giua mot event JSON va FE parse hong")
	}
}
