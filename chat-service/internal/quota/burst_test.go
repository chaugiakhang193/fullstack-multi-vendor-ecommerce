package quota

import (
	"testing"
	"time"
)

// newTestBurst dung Burst voi dong ho dung yen, tra kem con tro de test tua thoi gian toi.
func newTestBurst(capacity int, refill time.Duration) (*Burst, *time.Time) {
	moment := time.Date(2026, 8, 22, 10, 0, 0, 0, ICT)
	burst := NewBurst(capacity, refill)
	burst.now = func() time.Time { return moment }
	return burst, &moment
}

func TestBurstChoQuaHetSucChuaRoiMoiChan(t *testing.T) {
	burst, _ := newTestBurst(3, time.Second)
	subject := Subject{IP: "14.169.17.140"}

	for i := 0; i < 3; i++ {
		if decision := burst.Allow(subject); !decision.Allowed {
			t.Fatalf("lan %d bi chan: %s - gao phai day luc bat dau", i+1, decision.Reason)
		}
	}

	decision := burst.Allow(subject)
	if decision.Allowed {
		t.Fatal("lan thu 4 PHAI bi chan - gao da can")
	}
	if decision.Reason != ReasonBurst {
		t.Errorf("reason = %q, mong doi %q", decision.Reason, ReasonBurst)
	}
	if decision.RetryAfter <= 0 {
		t.Error("bi chan thi phai goi y khi nao thu lai duoc")
	}
}

// Day la nhanh ma Reserve mot minh KHONG chan duoc: cac request khong chong len nhau, nhung van
// den nhanh hon nguoi that go phim.
func TestBurstChanVongLapTuanTu(t *testing.T) {
	burst, clock := newTestBurst(2, time.Minute)
	subject := Subject{IP: "14.169.17.140"}

	burst.Allow(subject)
	burst.Allow(subject)

	// Moi request "chay xong" mat 100ms roi request sau moi vao - khong he chong len nhau.
	*clock = clock.Add(100 * time.Millisecond)

	if decision := burst.Allow(subject); decision.Allowed {
		t.Fatal("vong lap tuan tu PHAI bi chan - day la ly do Burst ton tai ben canh Reserve")
	}
}

func TestBurstNapLaiTheoThoiGian(t *testing.T) {
	burst, clock := newTestBurst(2, time.Second)
	subject := Subject{IP: "14.169.17.140"}

	burst.Allow(subject)
	burst.Allow(subject)
	if decision := burst.Allow(subject); decision.Allowed {
		t.Fatal("gao phai can sau 2 lan")
	}

	*clock = clock.Add(time.Second)

	if decision := burst.Allow(subject); !decision.Allowed {
		t.Fatalf("sau mot chu ky refill phai co lai 1 token, nhan %s", decision.Reason)
	}
}

func TestBurstKhongTichQuaSucChua(t *testing.T) {
	burst, clock := newTestBurst(2, time.Second)
	subject := Subject{IP: "14.169.17.140"}

	burst.Allow(subject)

	// Ngu mot tieng: neu khong chan tran thi bucket tich duoc 3600 token.
	*clock = clock.Add(time.Hour)

	for i := 0; i < 2; i++ {
		if decision := burst.Allow(subject); !decision.Allowed {
			t.Fatalf("lan %d bi chan sau khi nghi lau", i+1)
		}
	}
	if decision := burst.Allow(subject); decision.Allowed {
		t.Fatal("nghi lau khong duoc tich qua suc chua - neu khong thi cho mot tieng roi bam 3600 phat")
	}
}

func TestBurstTachTheoSubject(t *testing.T) {
	burst, _ := newTestBurst(1, time.Minute)

	if decision := burst.Allow(Subject{IP: "14.169.17.140"}); !decision.Allowed {
		t.Fatal("khach thu nhat bi chan ngay cau dau")
	}
	// Nguoi khac, khoa khac: khong duoc dinh gao cua nguoi dau tien.
	if decision := burst.Allow(Subject{IP: "1.2.3.4"}); !decision.Allowed {
		t.Fatal("hai IP khac nhau dang dung chung mot gao")
	}
	if decision := burst.Allow(Subject{UserID: "9f2c1d3e-0000-4000-8000-000000000001"}); !decision.Allowed {
		t.Fatal("user dang dung chung gao voi khach")
	}
}

func TestBurstDonBucketNgu(t *testing.T) {
	burst, clock := newTestBurst(2, time.Second)

	// Moi subject mot khoa, du de vuot burstSweepEvery va kich hoat mot lan don.
	for i := 0; i < burstSweepEvery; i++ {
		burst.Allow(Subject{IP: string(rune('a'+i%26)) + string(rune('a'+i/26))})
	}
	if burst.Len() == 0 {
		t.Fatal("chua co bucket nao de don")
	}

	// Qua idleTTL = capacity*refill thi moi bucket cu deu chac chan da day lai.
	*clock = clock.Add(time.Hour)
	for i := 0; i < burstSweepEvery; i++ {
		burst.Allow(Subject{IP: "14.169.17.140"})
	}

	if burst.Len() != 1 {
		t.Errorf("con %d bucket, mong doi 1 - bucket ngu khong duoc don thi map phinh mai", burst.Len())
	}
}
