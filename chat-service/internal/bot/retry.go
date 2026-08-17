package bot

import (
	"context"
	"errors"
	"math/rand/v2"
	"time"
)

const (
	// TotalBudget la tran thoi gian cho CA mot request, ke ca lan thu lai. Dat o day chu
	// khong o adapter: 25s la tran theo goc nhin nguoi dung dang cho, ma nguoi dung
	// khong biet ben trong da goi provider may lan.
	TotalBudget = 25 * time.Second

	// retryBaseDelay + retryJitter: cho 1.0–1.5s roi thu lai. Jitter de nhieu request
	// cung dinh mot su co khong dap tro lai provider cung mot khoanh khac.
	retryBaseDelay = 1 * time.Second
	retryJitter    = 500 * time.Millisecond
)

// Retrier thu lai DUNG MOT lan cho loi co the tu khoi. Khong dung retry san co cua SDK
// vi ba ly do: mac dinh cua no thu ca 429, no thu ngam nen log khong thay 25s da di
// dau, va no khong biet gi ve circuit breaker dang boc ben ngoai.
type Retrier struct {
	next  Client
	sleep func(context.Context, time.Duration) bool
	delay func() time.Duration
}

// NewRetrier boc mot Client bang lop thu lai.
func NewRetrier(next Client) *Retrier {
	return &Retrier{
		next:  next,
		sleep: sleepCtx,
		delay: func() time.Duration { return retryBaseDelay + rand.N(retryJitter) },
	}
}

// Generate goi provider, thu lai mot lan neu loi co the tu khoi va chua kip phun chu
// nao ra cho nguoi dung.
func (r *Retrier) Generate(ctx context.Context, req Request, sink Sink) (Result, error) {
	ctx, cancel := context.WithTimeout(ctx, TotalBudget)
	defer cancel()

	// delivered ghi nhan da co manh ket qua nao di ra ngoai chua. Bien nay la dieu kien
	// chan retry quan trong nhat: stream da phun nua cau roi ma goi lai tu dau thi
	// nguoi dung thay doan dau lap hai lan.
	delivered := false
	guarded := func(ev Event) error {
		delivered = true
		if sink == nil {
			return nil
		}
		return sink(ev)
	}

	res, err := r.next.Generate(ctx, req, guarded)
	if err == nil || !shouldRetry(err, delivered) {
		return res, err
	}

	// Het ngan sach 25s truoc khi kip cho xong thi tra loi cu, khong thu lai lay le.
	if !r.sleep(ctx, r.delay()) {
		return res, err
	}

	return r.next.Generate(ctx, req, guarded)
}

// shouldRetry quyet dinh co thu lai khong.
func shouldRetry(err error, delivered bool) bool {
	if delivered {
		return false
	}
	// 429 khong nam trong danh sach nay: da cham han muc thi lan thu hai chi to them
	// mot lan bi tu choi, va do chinh la thu circuit breaker dung ra de chan.
	return errors.Is(err, ErrUpstream) || errors.Is(err, ErrTimeout)
}

// sleepCtx ngu d, tra ve false neu ctx het han truoc khi ngu xong.
func sleepCtx(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
