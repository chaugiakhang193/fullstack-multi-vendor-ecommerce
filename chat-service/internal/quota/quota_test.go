package quota

import (
	"testing"
	"time"
)

// ictTime dung mot moc gio Viet Nam trong ngay 21/08/2026 cho gon o cac test ben duoi.
func ictTime(t *testing.T, hour, minute int) time.Time {
	t.Helper()
	return time.Date(2026, 8, 21, hour, minute, 0, 0, ICT)
}

func TestSubjectKeys(t *testing.T) {
	guest := Subject{IP: "14.169.17.140"}
	if got := guest.dayKey(); got != "ip:14.169.17.140" {
		t.Errorf("khoa ngay cua khach = %q, mong doi %q", got, "ip:14.169.17.140")
	}
	if !guest.IsGuest() {
		t.Error("subject khong co UserID phai la khach")
	}

	user := Subject{UserID: "9f2c1d3e", IP: "14.169.17.140"}
	if got := user.dayKey(); got != "user:9f2c1d3e" {
		t.Errorf("khoa ngay cua user = %q, mong doi %q", got, "user:9f2c1d3e")
	}
	// Co IP nhung da dang nhap thi van dem theo tai khoan: nguoc lai thi ca phong net dung
	// chung mot han muc.
	if user.IsGuest() {
		t.Error("subject co UserID khong duoc coi la khach")
	}
}

func TestHourKeyDoiTheoGioICT(t *testing.T) {
	user := Subject{UserID: "9f2c1d3e"}

	at14 := user.hourKey(ictTime(t, 14, 30))
	at15 := user.hourKey(ictTime(t, 15, 0))
	if at14 == at15 {
		t.Fatalf("hai gio khac nhau phai cho hai khoa khac nhau, deu ra %q", at14)
	}
	if at14 != "userhour:9f2c1d3e:14" {
		t.Errorf("khoa gio = %q, mong doi %q", at14, "userhour:9f2c1d3e:14")
	}

	// Gio mot chu so phai duoc dem 0 o dau, neu khong "userhour:x:1" vua la 1h vua la tien to
	// cua 10h-19h khi doc log.
	if got := user.hourKey(ictTime(t, 9, 59)); got != "userhour:9f2c1d3e:09" {
		t.Errorf("khoa gio 9h = %q, mong doi %q", got, "userhour:9f2c1d3e:09")
	}
}

func TestHourKeyDungGioVietNamChuKhongPhaiUTC(t *testing.T) {
	// 23:30 UTC ngay 20/08 = 06:30 ICT ngay 21/08.
	utcMoment := time.Date(2026, 8, 20, 23, 30, 0, 0, time.UTC)
	user := Subject{UserID: "9f2c1d3e"}

	if got := user.hourKey(utcMoment); got != "userhour:9f2c1d3e:06" {
		t.Errorf("khoa gio = %q, mong doi %q - dang dung gio UTC thay vi ICT", got, "userhour:9f2c1d3e:06")
	}
}

func TestDateOfLayNgayLichICT(t *testing.T) {
	// 22:00 UTC ngay 20/08 = 05:00 ICT ngay 21/08. Tinh theo UTC se ra ngay 20 - sai mot ngay.
	utcMoment := time.Date(2026, 8, 20, 22, 0, 0, 0, time.UTC)

	got := dateOf(utcMoment)
	if !got.Valid {
		t.Fatal("pgtype.Date phai co Valid=true, neu khong driver gui NULL xuong cot NOT NULL")
	}

	year, month, day := got.Time.Date()
	if year != 2026 || month != time.August || day != 21 {
		t.Errorf("ngay luu = %04d-%02d-%02d, mong doi 2026-08-21", year, month, day)
	}

	// Chuan hoa ve nua dem la QUY UOC chu khong phai dieu kien dung sai: driver chi lay Y/M/D nen
	// phan gio khong di xuong DB. Giu rang buoc de ai doc thang .Time khong tuong no mang theo gio.
	if h, m, s := got.Time.Clock(); h != 0 || m != 0 || s != 0 {
		t.Errorf("moc thoi gian = %02d:%02d:%02d, mong doi 00:00:00 UTC", h, m, s)
	}
}

func TestUntilNextDayVaNextHour(t *testing.T) {
	now := ictTime(t, 14, 30)

	if got := untilNextHour(now); got != 30*time.Minute {
		t.Errorf("con lai toi dau gio = %v, mong doi 30m", got)
	}
	if got := untilNextDay(now); got != 9*time.Hour+30*time.Minute {
		t.Errorf("con lai toi nua dem = %v, mong doi 9h30m", got)
	}
}

func TestUntilNextDayQuaCuoiThang(t *testing.T) {
	// 31/08 23:00 ICT: ngay ke tiep phai la 01/09, khong phai 32/08.
	now := time.Date(2026, 8, 31, 23, 0, 0, 0, ICT)
	if got := untilNextDay(now); got != time.Hour {
		t.Errorf("con lai toi nua dem = %v, mong doi 1h", got)
	}
}

func TestTierOfKhongLoKhoa(t *testing.T) {
	cases := map[string]string{
		"ip:14.169.17.140":     "guest_daily",
		"user:9f2c1d3e":        "user_daily",
		"userhour:9f2c1d3e:14": "user_hourly",
		"global":               "global",
	}
	for key, want := range cases {
		if got := tierOf(key); got != want {
			t.Errorf("tierOf(%q) = %q, mong doi %q", key, got, want)
		}
	}
}
