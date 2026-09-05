package bot

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// Warm chay nen nen test phai cho tin hieu tu handler thay vi doc bien ngay sau khi goi.
func TestWarmPokeHealthMotLan(t *testing.T) {
	hits := make(chan string, 4)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits <- r.URL.Path
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	warmer := NewWarmer(server.URL, testLogger())
	warmer.Warm(OutcomeHTTP5xx)

	select {
	case path := <-hits:
		if path != "/health" {
			t.Errorf("poke vao %q, muon /health", path)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("khong thay cu poke nao sau 2s")
	}
}

// Throttle: goi Warm lien tiep chi duoc phep sinh mot cu poke. Khong co throttle thi moi cau
// hoi truot deu danh them mot request vao service dang co gang khoi dong.
func TestWarmChiPokeMotLanTrongCuaSoThrottle(t *testing.T) {
	hits := make(chan struct{}, 8)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits <- struct{}{}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	warmer := NewWarmer(server.URL, testLogger())
	warmer.Warm(OutcomeHTTP5xx)

	select {
	case <-hits:
	case <-time.After(2 * time.Second):
		t.Fatal("cu poke dau tien khong toi")
	}

	for i := 0; i < 3; i++ {
		warmer.Warm(OutcomeHTTP5xx)
	}

	select {
	case <-hits:
		t.Fatal("co cu poke thu hai trong cua so throttle")
	case <-time.After(300 * time.Millisecond):
	}
}

func TestWarmKhongLamGiKhiThieuURL(t *testing.T) {
	warmer := NewWarmer("", testLogger())
	warmer.Warm(OutcomeHTTP5xx) // khong duoc panic va khong duoc goi di dau ca
}
