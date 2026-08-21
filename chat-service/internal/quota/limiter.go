package quota

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/store/chatdb"
	"github.com/jackc/pgx/v5/pgtype"
)

// Counter la phan duy nhat cua tang store ma Limiter can. Khai bao interface o day (ben DUNG)
// chu khong ben cung cap: nho vay test cua Limiter khong can Postgres, va package quota khong
// keo theo pgxpool.
type Counter interface {
	IncrementBotUsage(ctx context.Context, arg chatdb.IncrementBotUsageParams) (int32, error)
}

// Release nha co dang-chay cua subject. Luon phai duoc goi, ke ca tren duong loi - quen mot
// nhanh return la subject do bi khoa bot vinh vien.
type Release func()

// noopRelease dung cho cac duong tra ve khong gianh duoc co, de ben goi khong phai kiem nil
// truoc khi defer.
func noopRelease() {}

// Limiter la cong han muc. Mot instance dung chung cho ca service.
type Limiter struct {
	counter Counter
	limits  Limits

	// now tach thanh truong de test tiem duoc moc thoi gian (nua dem, dau gio) ma khong phai
	// ngoi cho dong ho that.
	now func() time.Time

	mu       sync.Mutex
	inFlight map[string]struct{}
}

// NewLimiter dung cong han muc tren mot Counter.
func NewLimiter(counter Counter, limits Limits) *Limiter {
	return &Limiter{
		counter:  counter,
		limits:   limits,
		now:      time.Now,
		inFlight: make(map[string]struct{}),
	}
}

// Limits tra ve bo han muc dang ap, dung cho log luc khoi dong va cho handler bao "con N/M".
func (l *Limiter) Limits() Limits {
	return l.limits
}

// Acquire xin mot luot cho subject.
//
// Chi khi Decision.Allowed la true thi Release moi giu thu gi that; cac truong hop con lai tra
// noopRelease de ben goi defer duoc vo dieu kien.
//
// Loi tu DB lam request bi TU CHOI (fail-closed): khong dem duoc thi khong biet dang dot bao
// nhieu, va luc DB hong thi hoi thoai cung khong luu duoc.
func (l *Limiter) Acquire(ctx context.Context, subj Subject) (Release, Decision, error) {
	now := l.now()

	// Co dang-chay gianh TRUOC khi dem: mot nguoi mo 20 tab thi 19 tab bi chan o day va khong
	// tab nao trong so do ton mot luot quota.
	release, ok := l.enter(subj.dayKey())
	if !ok {
		return noopRelease, deny(ReasonInFlight, inFlightRetryAfter), nil
	}

	decision, err := l.charge(ctx, subj, now)
	if err != nil || !decision.Allowed {
		release()
		return noopRelease, decision, err
	}
	return release, decision, nil
}

// charge tang cac bo dem theo dung thu tu va tra ve quyet dinh.
//
// THU TU LA MOT QUYET DINH BAO MAT chu khong phai sap xep tuy y:
//  1. Tang ca nhan truoc, tran global sau. Nguoc lai thi mot ke da het luot rieng van cong
//     duoc vao 300 luot global va giet bot cua ca thien ha.
//  2. Trong tang ca nhan: theo GIO truoc, theo NGAY sau. Nguoc lai thi nguoi cham tran gio van
//     bi tru mat mot luot cua ca ngay.
func (l *Limiter) charge(ctx context.Context, subj Subject, now time.Time) (Decision, error) {
	usageDate := dateOf(now)
	var remaining int32

	if subj.IsGuest() {
		usedDay, err := l.increment(ctx, subj.dayKey(), usageDate)
		if err != nil {
			return Decision{}, err
		}
		// So sanh ">" chu khong ">=": usedDay la so luot SAU khi tang, nen luot thu 5 voi han
		// muc 5 tra ve dung 5 va phai duoc cho qua.
		if usedDay > l.limits.GuestDaily {
			return deny(ReasonGuestDaily, untilNextDay(now)), nil
		}
		remaining = l.limits.GuestDaily - usedDay
	} else {
		usedHour, err := l.increment(ctx, subj.hourKey(now), usageDate)
		if err != nil {
			return Decision{}, err
		}
		if usedHour > l.limits.UserHourly {
			return deny(ReasonUserHourly, untilNextHour(now)), nil
		}

		usedDay, err := l.increment(ctx, subj.dayKey(), usageDate)
		if err != nil {
			return Decision{}, err
		}
		if usedDay > l.limits.UserDaily {
			return deny(ReasonUserDaily, untilNextDay(now)), nil
		}

		remaining = min(l.limits.UserHourly-usedHour, l.limits.UserDaily-usedDay)
	}

	usedGlobal, err := l.increment(ctx, globalKey, usageDate)
	if err != nil {
		return Decision{}, err
	}
	if usedGlobal > l.limits.GlobalDaily {
		return deny(ReasonGlobalDaily, untilNextDay(now)), nil
	}

	return Decision{Allowed: true, Reason: ReasonOK, Remaining: remaining}, nil
}

// increment tang mot bo dem va tra ve so luot sau khi tang.
func (l *Limiter) increment(ctx context.Context, key string, usageDate pgtype.Date) (int32, error) {
	params := chatdb.IncrementBotUsageParams{SubjectKey: key, UsageDate: usageDate}
	used, err := l.counter.IncrementBotUsage(ctx, params)
	if err != nil {
		// Loi mang TEN TANG chu khong mang khoa: khoa cua khach chua IP that.
		return 0, fmt.Errorf("dem luot tang %s loi: %w", tierOf(key), err)
	}
	return used, nil
}

// enter gianh co dang-chay. Tra ve false neu subject dang co mot cau hoi chay do.
func (l *Limiter) enter(key string) (Release, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if _, busy := l.inFlight[key]; busy {
		return nil, false
	}
	l.inFlight[key] = struct{}{}

	// sync.Once de goi Release nhieu lan la vo hai: ben goi vua defer vua goi tay o duong thoat
	// som la chuyen binh thuong, va lan goi thu hai khong duoc xoa co cua REQUEST KHAC vua
	// gianh duoc cung khoa do.
	var once sync.Once
	return func() {
		once.Do(func() { l.leave(key) })
	}, true
}

// leave nha co dang-chay.
func (l *Limiter) leave(key string) {
	l.mu.Lock()
	delete(l.inFlight, key)
	l.mu.Unlock()
}
