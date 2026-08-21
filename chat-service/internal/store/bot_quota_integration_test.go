package store

import (
	"testing"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/quota"
)

// Hai test nay chay qua DB THAT. Phan logic tang/tu choi cua Limiter da co test rieng voi
// Counter gia o internal/quota; o day chi kiem nhung gi Counter gia khong the chung minh.
//
// Khong co vong import: quota chi import chatdb, khong import store.

// testQuotaLimits dat han muc nho de khong phai goi 300 lan qua DB.
func testQuotaLimits() quota.Limits {
	return quota.Limits{GuestDaily: 2, UserDaily: 5, UserHourly: 5, GlobalDaily: 10}
}

// Thu duy nhat Counter gia khong chung minh duoc: pgtype.Date do quota sinh ra co ghi dung NGAY
// LICH Viet Nam xuong Postgres hay khong.
func TestLimiterGhiDungNgayLichICT(t *testing.T) {
	s, ctx := setupTestDB(t)

	limiter := quota.NewLimiter(s.Queries(), testQuotaLimits())
	guest := quota.Subject{IP: "14.169.17.140"}

	release, decision, err := limiter.Acquire(ctx, guest)
	if err != nil {
		t.Fatalf("Acquire loi: %v", err)
	}
	release()
	if !decision.Allowed {
		t.Fatalf("luot dau bi tu choi voi ly do %q", decision.Reason)
	}

	var storedDate time.Time
	var count int32
	row := s.Pool().QueryRow(ctx,
		`SELECT usage_date, message_count FROM bot_usage_daily WHERE subject_key = $1`,
		"ip:14.169.17.140",
	)
	if err := row.Scan(&storedDate, &count); err != nil {
		t.Fatalf("doc lai row vua ghi loi: %v", err)
	}

	wantYear, wantMonth, wantDay := time.Now().In(quota.ICT).Date()
	gotYear, gotMonth, gotDay := storedDate.Date()
	if gotYear != wantYear || gotMonth != wantMonth || gotDay != wantDay {
		t.Errorf("usage_date luu = %04d-%02d-%02d, mong doi ngay lich ICT %04d-%02d-%02d",
			gotYear, gotMonth, gotDay, wantYear, wantMonth, wantDay)
	}
	if count != 1 {
		t.Errorf("message_count = %d, mong doi 1", count)
	}
}

// Chay het han muc qua duong DB that de chac rang cau upsert va phep so sanh o Limiter khop
// nhau - hai thu nay o hai file khac nhau nen chung chi thuc su duoc doi chieu o day.
func TestLimiterTuChoiTrenDBThat(t *testing.T) {
	s, ctx := setupTestDB(t)

	limiter := quota.NewLimiter(s.Queries(), testQuotaLimits())
	guest := quota.Subject{IP: "14.169.17.140"}

	for i := 1; i <= 2; i++ {
		release, decision, err := limiter.Acquire(ctx, guest)
		if err != nil {
			t.Fatalf("Acquire luot %d loi: %v", i, err)
		}
		release()
		if !decision.Allowed {
			t.Fatalf("luot %d phai duoc qua, bi tu choi voi ly do %q", i, decision.Reason)
		}
	}

	release, decision, err := limiter.Acquire(ctx, guest)
	if err != nil {
		t.Fatalf("Acquire luot 3 loi: %v", err)
	}
	release()
	if decision.Allowed {
		t.Fatal("luot 3 phai bi tu choi khi han muc la 2")
	}
	if decision.Reason != quota.ReasonGuestDaily {
		t.Errorf("ly do = %q, mong doi %q", decision.Reason, quota.ReasonGuestDaily)
	}

	// Luot bi tu choi VAN duoc ghi (quyet dinh so 3 cua plan: khong bu tru). Kiem o day de con
	// so tren DB khong lam ai bat ngo luc doc bang.
	var count int32
	row := s.Pool().QueryRow(ctx,
		`SELECT message_count FROM bot_usage_daily WHERE subject_key = $1`,
		"ip:14.169.17.140",
	)
	if err := row.Scan(&count); err != nil {
		t.Fatalf("doc lai bo dem loi: %v", err)
	}
	if count != 3 {
		t.Errorf("bo dem = %d, mong doi 3 (luot bi tu choi van ton mot lan tang, khong bu tru)", count)
	}
}
