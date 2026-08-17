package bot

import (
	"context"
	"errors"
	"testing"
	"time"
)

// newTestRetrier dung Retrier khong ngu that, de test chay trong vai mili giay.
func newTestRetrier(next Client) *Retrier {
	r := NewRetrier(next)
	r.sleep = noSleep
	r.delay = func() time.Duration { return 0 }
	return r
}

func TestRetrierThuLaiMotLanVoiLoiServer(t *testing.T) {
	fake := newFakeClient(failTurn(ErrUpstream), okTurn())
	retrier := newTestRetrier(fake)

	if _, err := retrier.Generate(context.Background(), Request{}, nil); err != nil {
		t.Fatalf("muon lan thu hai thanh cong, nhan loi: %v", err)
	}
	if got := fake.callCount(); got != 2 {
		t.Fatalf("so lan goi = %d, muon 2", got)
	}
}

func TestRetrierKhongThuLaiVoiRateLimited(t *testing.T) {
	fake := newFakeClient(failTurn(ErrRateLimited))
	retrier := newTestRetrier(fake)

	_, err := retrier.Generate(context.Background(), Request{}, nil)
	if !errors.Is(err, ErrRateLimited) {
		t.Fatalf("loi = %v, muon ErrRateLimited", err)
	}
	if got := fake.callCount(); got != 1 {
		t.Fatalf("so lan goi = %d, muon 1 — 429 khong duoc thu lai", got)
	}
}

func TestRetrierKhongThuLaiSauKhiDaPhunChu(t *testing.T) {
	fake := newFakeClient(fakeTurn{
		err:  ErrUpstream,
		emit: []Event{{Kind: EventText, Text: "Xin ch"}},
	})
	retrier := newTestRetrier(fake)

	var received []string
	sink := func(ev Event) error {
		received = append(received, ev.Text)
		return nil
	}

	if _, err := retrier.Generate(context.Background(), Request{}, sink); err == nil {
		t.Fatal("muon loi")
	}
	if got := fake.callCount(); got != 1 {
		t.Fatalf("so lan goi = %d, muon 1 — da phun chu thi khong duoc goi lai", got)
	}
	if len(received) != 1 {
		t.Fatalf("nguoi dung nhan %d manh chu, muon 1 — thu lai se lam lap doan dau", len(received))
	}
}

func TestRetrierChiThuLaiDungMotLan(t *testing.T) {
	fake := newFakeClient(failTurn(ErrUpstream))
	retrier := newTestRetrier(fake)

	if _, err := retrier.Generate(context.Background(), Request{}, nil); !errors.Is(err, ErrUpstream) {
		t.Fatalf("loi = %v, muon ErrUpstream", err)
	}
	if got := fake.callCount(); got != 2 {
		t.Fatalf("so lan goi = %d, muon dung 2 (mot lan dau + mot lan thu lai)", got)
	}
}

func TestRetrierKhongThuLaiVoiLoiDauVao(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
	}{
		{"bad request", ErrBadRequest},
		{"bi chan", ErrBlocked},
	} {
		t.Run(tc.name, func(t *testing.T) {
			fake := newFakeClient(failTurn(tc.err))
			retrier := newTestRetrier(fake)

			if _, err := retrier.Generate(context.Background(), Request{}, nil); !errors.Is(err, tc.err) {
				t.Fatalf("loi = %v, muon %v", err, tc.err)
			}
			if got := fake.callCount(); got != 1 {
				t.Fatalf("so lan goi = %d, muon 1 — goi lai cung sai y het", got)
			}
		})
	}
}

func TestRetrierKhongThuLaiKhiHetNganSach(t *testing.T) {
	fake := newFakeClient(failTurn(ErrUpstream))
	retrier := NewRetrier(fake)
	// sleep tra false = ctx het han truoc khi ngu xong.
	retrier.sleep = func(ctx context.Context, d time.Duration) bool { return false }

	if _, err := retrier.Generate(context.Background(), Request{}, nil); !errors.Is(err, ErrUpstream) {
		t.Fatalf("loi = %v, muon ErrUpstream", err)
	}
	if got := fake.callCount(); got != 1 {
		t.Fatalf("so lan goi = %d, muon 1 — het gio thi khong thu lai lay le", got)
	}
}

func TestRetrierApTranThoiGianChoCaRequest(t *testing.T) {
	var deadline time.Time
	var hasDeadline bool
	spy := clientFunc(func(ctx context.Context, req Request, sink Sink) (Result, error) {
		deadline, hasDeadline = ctx.Deadline()
		return Result{}, nil
	})

	before := time.Now()
	if _, err := NewRetrier(spy).Generate(context.Background(), Request{}, nil); err != nil {
		t.Fatalf("Generate loi: %v", err)
	}

	if !hasDeadline {
		t.Fatal("Retrier phai dat han cho ctx truyen xuong")
	}
	budget := deadline.Sub(before)
	if budget > TotalBudget+time.Second || budget < TotalBudget-time.Second {
		t.Errorf("ngan sach = %v, muon xap xi %v", budget, TotalBudget)
	}
}

// clientFunc cho phep dung mot Client tu mot ham, tien cho test can soi ctx.
type clientFunc func(context.Context, Request, Sink) (Result, error)

func (f clientFunc) Generate(ctx context.Context, req Request, sink Sink) (Result, error) {
	return f(ctx, req, sink)
}
