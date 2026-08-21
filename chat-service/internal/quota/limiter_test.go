package quota

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/store/chatdb"
)

// fakeCounter dem trong bo nho, dung nguyen tac giong query that: TANG roi tra ve so SAU khi
// tang. Neu ban giong that o cho nay thi test se khong bat duoc loi off-by-one.
type fakeCounter struct {
	mu     sync.Mutex
	counts map[string]int32
	err    error
}

func newFakeCounter() *fakeCounter {
	return &fakeCounter{counts: make(map[string]int32)}
}

func (f *fakeCounter) IncrementBotUsage(_ context.Context, arg chatdb.IncrementBotUsageParams) (int32, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.err != nil {
		return 0, f.err
	}
	f.counts[arg.SubjectKey]++
	return f.counts[arg.SubjectKey], nil
}

func (f *fakeCounter) count(key string) int32 {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.counts[key]
}

// testLimits dung han muc nho de test khong phai lap 300 lan.
func testLimits() Limits {
	return Limits{GuestDaily: 3, UserDaily: 5, UserHourly: 2, GlobalDaily: 6}
}

// newTestLimiter dung Limiter voi dong ho dung yen tai moc cho truoc.
func newTestLimiter(counter Counter, now time.Time) *Limiter {
	limiter := NewLimiter(counter, testLimits())
	limiter.now = func() time.Time { return now }
	return limiter
}

// askOnce xin mot luot roi nha co ngay, mo phong mot cau hoi da tra loi xong.
func askOnce(t *testing.T, limiter *Limiter, subj Subject) Decision {
	t.Helper()

	release, decision, err := limiter.Acquire(context.Background(), subj)
	if err != nil {
		t.Fatalf("Acquire loi: %v", err)
	}
	release()
	return decision
}

func TestKhachHetLuotSauKhiDungDuHanMuc(t *testing.T) {
	counter := newFakeCounter()
	limiter := newTestLimiter(counter, ictTime(t, 14, 30))
	guest := Subject{IP: "14.169.17.140"}

	// Ba luot dau phai qua het: han muc 3 nghia la duoc dung 3, khong phai 2.
	for i := 1; i <= 3; i++ {
		decision := askOnce(t, limiter, guest)
		if !decision.Allowed {
			t.Fatalf("luot %d bi tu choi (%s) - dang dinh off-by-one, han muc la 3", i, decision.Reason)
		}
		if want := int32(3 - i); decision.Remaining != want {
			t.Errorf("luot %d con lai %d, mong doi %d", i, decision.Remaining, want)
		}
	}

	fourth := askOnce(t, limiter, guest)
	if fourth.Allowed {
		t.Fatal("luot 4 phai bi tu choi")
	}
	if fourth.Reason != ReasonGuestDaily {
		t.Errorf("ly do = %q, mong doi %q", fourth.Reason, ReasonGuestDaily)
	}
	if fourth.RetryAfter != 9*time.Hour+30*time.Minute {
		t.Errorf("RetryAfter = %v, mong doi 9h30m (toi nua dem ICT)", fourth.RetryAfter)
	}
}

func TestKhachHetLuotKhongDotThemTranGlobal(t *testing.T) {
	counter := newFakeCounter()
	limiter := newTestLimiter(counter, ictTime(t, 14, 30))
	guest := Subject{IP: "14.169.17.140"}

	for i := 0; i < 3; i++ {
		askOnce(t, limiter, guest)
	}
	globalBefore := counter.count(globalKey)

	askOnce(t, limiter, guest) // luot thu 4, bi tu choi

	if got := counter.count(globalKey); got != globalBefore {
		t.Fatalf("tran global tang tu %d len %d khi request da bi tu choi - mot ke het luot van "+
			"dot duoc van an toan chung", globalBefore, got)
	}
}

func TestUserChamTranGioTruocTranNgay(t *testing.T) {
	counter := newFakeCounter()
	limiter := newTestLimiter(counter, ictTime(t, 14, 30))
	user := Subject{UserID: "9f2c1d3e", IP: "14.169.17.140"}

	askOnce(t, limiter, user)
	askOnce(t, limiter, user)

	third := askOnce(t, limiter, user)
	if third.Allowed {
		t.Fatal("luot 3 phai bi chan boi tran gio (UserHourly=2)")
	}
	if third.Reason != ReasonUserHourly {
		t.Fatalf("ly do = %q, mong doi %q", third.Reason, ReasonUserHourly)
	}
	if third.RetryAfter != 30*time.Minute {
		t.Errorf("RetryAfter = %v, mong doi 30m (toi dau gio sau)", third.RetryAfter)
	}

	// Cham tran gio thi bo dem NGAY khong duoc tang lay: nguoc lai thi mot nguoi bi chan theo
	// gio van mat dan han muc ngay du khong hoi duoc cau nao.
	if got := counter.count(user.dayKey()); got != 2 {
		t.Errorf("bo dem ngay = %d, mong doi 2 - luot bi chan theo gio khong duoc tru vao ngay", got)
	}
}

func TestTranGioResetSangGioKeTiep(t *testing.T) {
	counter := newFakeCounter()
	limiter := newTestLimiter(counter, ictTime(t, 14, 30))
	user := Subject{UserID: "9f2c1d3e"}

	askOnce(t, limiter, user)
	askOnce(t, limiter, user)

	// Sang 15h: khoa gio doi nen bo dem gio bat dau lai tu 0.
	limiter.now = func() time.Time { return ictTime(t, 15, 0) }

	decision := askOnce(t, limiter, user)
	if !decision.Allowed {
		t.Fatalf("sang gio moi phai duoc hoi tiep, bi tu choi voi ly do %q", decision.Reason)
	}
}

func TestTranGlobalChanCaNguoiConLuot(t *testing.T) {
	counter := newFakeCounter()
	limiter := newTestLimiter(counter, ictTime(t, 14, 30))

	// GlobalDaily=3 cho rieng test nay de khong phai dung 6 subject khac nhau.
	limiter.limits.GlobalDaily = 3

	ips := []string{"10.0.0.1", "10.0.0.2", "10.0.0.3"}
	for i, ip := range ips {
		if decision := askOnce(t, limiter, Subject{IP: ip}); !decision.Allowed {
			t.Fatalf("khach thu %d phai duoc qua", i+1)
		}
	}

	fresh := Subject{IP: "10.0.0.9"}
	decision := askOnce(t, limiter, fresh)
	if decision.Allowed {
		t.Fatal("cham tran global thi khach moi tinh cung phai bi chan")
	}
	if decision.Reason != ReasonGlobalDaily {
		t.Errorf("ly do = %q, mong doi %q", decision.Reason, ReasonGlobalDaily)
	}
}

func TestCoDangChayChanTabThuHai(t *testing.T) {
	counter := newFakeCounter()
	limiter := newTestLimiter(counter, ictTime(t, 14, 30))
	guest := Subject{IP: "14.169.17.140"}

	release, first, err := limiter.Acquire(context.Background(), guest)
	if err != nil {
		t.Fatalf("Acquire loi: %v", err)
	}
	if !first.Allowed {
		t.Fatal("luot dau phai duoc qua")
	}

	_, second, err := limiter.Acquire(context.Background(), guest)
	if err != nil {
		t.Fatalf("Acquire lan hai loi: %v", err)
	}
	if second.Allowed {
		t.Fatal("cau hoi thu hai khi cau dau chua xong phai bi chan")
	}
	if second.Reason != ReasonInFlight {
		t.Errorf("ly do = %q, mong doi %q", second.Reason, ReasonInFlight)
	}

	// Bi chan boi co dang-chay thi KHONG duoc ton luot quota nao.
	if got := counter.count(guest.dayKey()); got != 1 {
		t.Errorf("bo dem ngay = %d, mong doi 1 - request bi chan boi co dang-chay dang bi tinh luot", got)
	}

	release()

	third := askOnce(t, limiter, guest)
	if !third.Allowed {
		t.Fatal("nha co xong thi phai hoi tiep duoc")
	}
}

func TestReleaseGoiNhieuLanVoHai(t *testing.T) {
	counter := newFakeCounter()
	limiter := newTestLimiter(counter, ictTime(t, 14, 30))
	guest := Subject{IP: "14.169.17.140"}

	release, _, err := limiter.Acquire(context.Background(), guest)
	if err != nil {
		t.Fatalf("Acquire loi: %v", err)
	}
	release()
	release() // ben goi vua defer vua goi tay

	// Sau do mot request khac gianh co, va lan release thua o tren khong duoc xoa co cua no.
	other, _, err := limiter.Acquire(context.Background(), guest)
	if err != nil {
		t.Fatalf("Acquire lan hai loi: %v", err)
	}
	defer other()

	_, blocked, err := limiter.Acquire(context.Background(), guest)
	if err != nil {
		t.Fatalf("Acquire lan ba loi: %v", err)
	}
	if blocked.Allowed {
		t.Fatal("co dang-chay dang bi mot lan release thua xoa mat")
	}
}

func TestLoiDBThiTuChoiVaNhaCo(t *testing.T) {
	counter := newFakeCounter()
	counter.err = errors.New("ket noi DB dut")
	limiter := newTestLimiter(counter, ictTime(t, 14, 30))
	guest := Subject{IP: "14.169.17.140"}

	_, decision, err := limiter.Acquire(context.Background(), guest)
	if err == nil {
		t.Fatal("loi DB phai duoc bao len, khong duoc nuot")
	}
	if decision.Allowed {
		t.Fatal("loi DB thi phai tu choi (fail-closed)")
	}

	// Co phai duoc nha du duong thoat la duong loi, neu khong subject bi khoa vinh vien.
	counter.err = nil
	after := askOnce(t, limiter, guest)
	if !after.Allowed {
		t.Fatalf("DB khoe lai thi phai hoi duoc, bi tu choi voi ly do %q", after.Reason)
	}
}

func TestThongBaoLoiKhongChuaIP(t *testing.T) {
	counter := newFakeCounter()
	counter.err = errors.New("ket noi DB dut")
	limiter := newTestLimiter(counter, ictTime(t, 14, 30))

	_, _, err := limiter.Acquire(context.Background(), Subject{IP: "14.169.17.140"})
	if err == nil {
		t.Fatal("mong doi loi")
	}
	if strings.Contains(err.Error(), "14.169.17.140") {
		t.Errorf("thong bao loi chua IP that: %q", err.Error())
	}
}
