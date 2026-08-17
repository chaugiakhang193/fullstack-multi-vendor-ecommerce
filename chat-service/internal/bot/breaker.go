package bot

import (
	"context"
	"errors"
	"sync"
	"time"
)

const (
	// breakerThreshold: 5 loi LIEN TIEP moi mo. Mot lan thanh cong xen giua se dat lai
	// bo dem — 5 loi rai rac trong ca ngay khong phai su co.
	breakerThreshold = 5

	// breakerOpenFor: mo 60s roi cho dung mot request di tham do.
	breakerOpenFor = 60 * time.Second
)

type breakerState int

const (
	breakerClosed breakerState = iota
	breakerOpen
	breakerHalfOpen
)

// Breaker chan goi provider khi provider dang hong, de khong dot them quota va khong
// bat nguoi dung cho 25s cho mot ket qua chac chan la loi. Boc NGOAI Retrier: nho vay
// hai lan thu cua cung mot request chi tinh la mot lan hong, va khi breaker dang mo thi
// tiet kiem duoc luon ca khoang cho giua hai lan thu.
type Breaker struct {
	next Client
	// now tach ra thanh truong de test tua thoi gian toi luc half-open ma khong phai
	// ngu that 60s.
	now func() time.Time

	mu            sync.Mutex
	state         breakerState
	failures      int
	openUntil     time.Time
	probeInFlight bool
}

// NewBreaker boc mot Client bang circuit breaker.
func NewBreaker(next Client) *Breaker {
	return &Breaker{next: next, now: time.Now}
}

// Generate tu choi ngay neu breaker dang mo, nguoc lai goi xuong duoi va ghi nhan ket qua.
func (b *Breaker) Generate(ctx context.Context, req Request, sink Sink) (Result, error) {
	if err := b.acquire(); err != nil {
		return Result{}, err
	}

	delivered := false
	guarded := func(ev Event) error {
		delivered = true
		if sink == nil {
			return nil
		}
		return sink(ev)
	}

	res, err := b.next.Generate(ctx, req, guarded)
	b.record(err, delivered)
	return res, err
}

// acquire kiem cong. Tra ErrCircuitOpen neu khong duoc phep goi provider.
func (b *Breaker) acquire() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	switch b.state {
	case breakerOpen:
		if b.now().Before(b.openUntil) {
			return ErrCircuitOpen
		}
		// Het thoi gian mo: chuyen sang half-open va cho DUNG MOT request di tham do.
		b.state = breakerHalfOpen
		b.probeInFlight = true
		return nil
	case breakerHalfOpen:
		// Da co request tham do dang chay: nhung request khac van bi chan. Tha ca dam
		// vao mot provider vua hong xong la kieu dam sap lai lan hai.
		if b.probeInFlight {
			return ErrCircuitOpen
		}
		b.probeInFlight = true
		return nil
	default:
		return nil
	}
}

// record cap nhat trang thai breaker theo ket qua mot lan goi.
func (b *Breaker) record(err error, delivered bool) {
	b.mu.Lock()
	defer b.mu.Unlock()

	wasHalfOpen := b.state == breakerHalfOpen
	if wasHalfOpen {
		b.probeInFlight = false
	}

	if !countsAsFailure(err, delivered) {
		b.state = breakerClosed
		b.failures = 0
		return
	}

	// 429 la bang chung da cham han muc chu khong phai mot loi le, va request tham do
	// that bai la bang chung provider chua hoi: ca hai mo ngay, khong cho du 5 lan.
	if errors.Is(err, ErrRateLimited) || wasHalfOpen {
		b.trip()
		return
	}

	b.failures++
	if b.failures >= breakerThreshold {
		b.trip()
	}
}

// trip mo breaker trong breakerOpenFor.
func (b *Breaker) trip() {
	b.state = breakerOpen
	b.failures = 0
	b.openUntil = b.now().Add(breakerOpenFor)
}

// countsAsFailure phan biet "provider hong" voi nhung loi khac cung tra ve err.
func countsAsFailure(err error, delivered bool) bool {
	if err == nil {
		return false
	}

	// Loi do dau vao cua chinh minh, hoac do bo loc an toan chan: provider van khoe.
	// Mo breaker luc nay chi lam hong ca nhung request le ra chay tot.
	if errors.Is(err, ErrBadRequest) || errors.Is(err, ErrBlocked) {
		return false
	}

	// Stream dut giua chung SAU khi da phun duoc chu: nguoi dung van co mot phan cau tra
	// loi, va cau tra loi dai cham tran 25s la chuyen binh thuong. Tinh vao bo dem thi
	// chi can vai cau hoi kho lien tiep la breaker tu mo trong khi provider hoan toan khoe.
	if delivered && errors.Is(err, ErrTimeout) {
		return false
	}

	// Nguoi dung dong ket noi khong phai loi cua provider.
	if errors.Is(err, context.Canceled) {
		return false
	}

	return true
}
