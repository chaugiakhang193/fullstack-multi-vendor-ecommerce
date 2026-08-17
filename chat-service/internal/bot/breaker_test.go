package bot

import (
	"context"
	"errors"
	"testing"
	"time"
)

// newTestBreaker dung Breaker voi dong ho gia, de tua toi luc half-open ma khong ngu that.
func newTestBreaker(next Client) (*Breaker, *fakeClock) {
	clock := &fakeClock{now: time.Date(2026, 8, 15, 9, 0, 0, 0, time.UTC)}
	breaker := NewBreaker(next)
	breaker.now = clock.Now
	return breaker, clock
}

type fakeClock struct {
	now time.Time
}

func (c *fakeClock) Now() time.Time          { return c.now }
func (c *fakeClock) advance(d time.Duration) { c.now = c.now.Add(d) }

func TestBreakerMoSauNamLoiLienTiep(t *testing.T) {
	fake := newFakeClient(failTurn(ErrUpstream))
	breaker, _ := newTestBreaker(fake)

	for i := 0; i < breakerThreshold; i++ {
		if _, err := breaker.Generate(context.Background(), Request{}, nil); !errors.Is(err, ErrUpstream) {
			t.Fatalf("lan %d: loi = %v, muon ErrUpstream", i+1, err)
		}
	}

	_, err := breaker.Generate(context.Background(), Request{}, nil)
	if !errors.Is(err, ErrCircuitOpen) {
		t.Fatalf("loi = %v, muon ErrCircuitOpen", err)
	}
	if got := fake.callCount(); got != breakerThreshold {
		t.Fatalf("so lan goi provider = %d, muon %d — request sau khi mo khong duoc di tiep", got, breakerThreshold)
	}
}

func TestBreakerMoNgayVoiRateLimited(t *testing.T) {
	fake := newFakeClient(failTurn(ErrRateLimited))
	breaker, _ := newTestBreaker(fake)

	if _, err := breaker.Generate(context.Background(), Request{}, nil); !errors.Is(err, ErrRateLimited) {
		t.Fatalf("loi = %v, muon ErrRateLimited", err)
	}

	_, err := breaker.Generate(context.Background(), Request{}, nil)
	if !errors.Is(err, ErrCircuitOpen) {
		t.Fatalf("loi = %v, muon ErrCircuitOpen — 429 phai mo ngay, khong cho du 5 lan", err)
	}
}

func TestBreakerMotLanThanhCongDatLaiBoDem(t *testing.T) {
	// 4 loi, 1 thanh cong, roi 4 loi nua: tong 8 loi nhung khong lan nao du 5 LIEN TIEP.
	script := []fakeTurn{
		failTurn(ErrUpstream), failTurn(ErrUpstream), failTurn(ErrUpstream), failTurn(ErrUpstream),
		okTurn(),
		failTurn(ErrUpstream), failTurn(ErrUpstream), failTurn(ErrUpstream), failTurn(ErrUpstream),
		okTurn(),
	}
	fake := newFakeClient(script...)
	breaker, _ := newTestBreaker(fake)

	for i := 0; i < 9; i++ {
		if _, err := breaker.Generate(context.Background(), Request{}, nil); errors.Is(err, ErrCircuitOpen) {
			t.Fatalf("lan %d: breaker mo som — 5 loi phai la LIEN TIEP", i+1)
		}
	}
}

func TestBreakerKhongDemLoiDauVaoVaLoiBiChan(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
	}{
		{"bad request", ErrBadRequest},
		{"bi chan", ErrBlocked},
	} {
		t.Run(tc.name, func(t *testing.T) {
			fake := newFakeClient(failTurn(tc.err))
			breaker, _ := newTestBreaker(fake)

			for i := 0; i < breakerThreshold+2; i++ {
				if _, err := breaker.Generate(context.Background(), Request{}, nil); errors.Is(err, ErrCircuitOpen) {
					t.Fatalf("lan %d: breaker mo — loi nay khong phai loi cua provider", i+1)
				}
			}
		})
	}
}

func TestBreakerKhongDemTimeoutSauKhiDaPhunChu(t *testing.T) {
	fake := newFakeClient(fakeTurn{
		err:  ErrTimeout,
		emit: []Event{{Kind: EventText, Text: "cau tra loi dai..."}},
	})
	breaker, _ := newTestBreaker(fake)

	for i := 0; i < breakerThreshold+2; i++ {
		_, err := breaker.Generate(context.Background(), Request{}, func(Event) error { return nil })
		if errors.Is(err, ErrCircuitOpen) {
			t.Fatalf("lan %d: breaker mo — cau tra loi dai bi cat khong phai su co cua provider", i+1)
		}
	}
}

func TestBreakerDemTimeoutKhiChuaPhunDuocChuNao(t *testing.T) {
	fake := newFakeClient(failTurn(ErrTimeout))
	breaker, _ := newTestBreaker(fake)

	for i := 0; i < breakerThreshold; i++ {
		if _, err := breaker.Generate(context.Background(), Request{}, nil); !errors.Is(err, ErrTimeout) {
			t.Fatalf("lan %d: loi = %v", i+1, err)
		}
	}

	if _, err := breaker.Generate(context.Background(), Request{}, nil); !errors.Is(err, ErrCircuitOpen) {
		t.Fatalf("loi = %v, muon ErrCircuitOpen — im lang hoan toan la su co that", err)
	}
}

func TestBreakerHetGioMoThiChoMotRequestThamDo(t *testing.T) {
	fake := newFakeClient(failTurn(ErrRateLimited), okTurn())
	breaker, clock := newTestBreaker(fake)

	// Mot lan 429 la mo.
	if _, err := breaker.Generate(context.Background(), Request{}, nil); !errors.Is(err, ErrRateLimited) {
		t.Fatalf("loi = %v", err)
	}
	if _, err := breaker.Generate(context.Background(), Request{}, nil); !errors.Is(err, ErrCircuitOpen) {
		t.Fatalf("loi = %v, muon ErrCircuitOpen", err)
	}

	// Chua het 60s: van chan.
	clock.advance(breakerOpenFor - time.Second)
	if _, err := breaker.Generate(context.Background(), Request{}, nil); !errors.Is(err, ErrCircuitOpen) {
		t.Fatalf("loi = %v, muon van con chan khi chua het 60s", err)
	}

	// Het 60s: request tham do di qua, thanh cong thi dong han breaker.
	clock.advance(2 * time.Second)
	if _, err := breaker.Generate(context.Background(), Request{}, nil); err != nil {
		t.Fatalf("request tham do loi: %v", err)
	}
	if _, err := breaker.Generate(context.Background(), Request{}, nil); err != nil {
		t.Fatalf("sau khi tham do thanh cong breaker phai dong han, nhan loi: %v", err)
	}
}

func TestBreakerThamDoThatBaiThiMoLai(t *testing.T) {
	fake := newFakeClient(failTurn(ErrRateLimited))
	breaker, clock := newTestBreaker(fake)

	if _, err := breaker.Generate(context.Background(), Request{}, nil); !errors.Is(err, ErrRateLimited) {
		t.Fatalf("loi = %v", err)
	}
	clock.advance(breakerOpenFor + time.Second)

	// Request tham do: di qua duoc nhung that bai.
	if _, err := breaker.Generate(context.Background(), Request{}, nil); !errors.Is(err, ErrRateLimited) {
		t.Fatalf("loi = %v, muon ErrRateLimited", err)
	}

	// Mo lai ngay, khong cho tham do lien tuc.
	if _, err := breaker.Generate(context.Background(), Request{}, nil); !errors.Is(err, ErrCircuitOpen) {
		t.Fatalf("loi = %v, muon ErrCircuitOpen", err)
	}
}

func TestBreakerChiChoDungMotRequestThamDoChayCungLuc(t *testing.T) {
	blocking := &blockingClient{
		entered: make(chan struct{}),
		release: make(chan struct{}),
	}
	breaker, clock := newTestBreaker(blocking)

	// Dua breaker ve trang thai mo bang cach nhoi 429 qua mot client khac.
	breaker.record(ErrRateLimited, false)
	if _, err := breaker.Generate(context.Background(), Request{}, nil); !errors.Is(err, ErrCircuitOpen) {
		t.Fatalf("loi = %v, muon ErrCircuitOpen", err)
	}
	clock.advance(breakerOpenFor + time.Second)

	// Request tham do chay va dung lai o giua.
	done := make(chan error, 1)
	go func() {
		_, err := breaker.Generate(context.Background(), Request{}, nil)
		done <- err
	}()
	<-blocking.entered

	// Request thu hai toi trong luc tham do chua xong: phai bi chan.
	if _, err := breaker.Generate(context.Background(), Request{}, nil); !errors.Is(err, ErrCircuitOpen) {
		t.Fatalf("loi = %v, muon ErrCircuitOpen — chi mot request duoc tham do", err)
	}

	close(blocking.release)
	if err := <-done; err != nil {
		t.Fatalf("request tham do loi: %v", err)
	}
}

func TestBreakerKhongDemViecNguoiDungDongKetNoi(t *testing.T) {
	fake := newFakeClient(failTurn(context.Canceled))
	breaker, _ := newTestBreaker(fake)

	for i := 0; i < breakerThreshold+2; i++ {
		if _, err := breaker.Generate(context.Background(), Request{}, nil); errors.Is(err, ErrCircuitOpen) {
			t.Fatalf("lan %d: breaker mo — nguoi dung bo di khong phai loi cua provider", i+1)
		}
	}
}
