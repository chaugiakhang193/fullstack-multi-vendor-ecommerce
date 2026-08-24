package killswitch

import (
	"testing"
	"time"
)

// switchWithClock dung Switch chay bang dong ho gia. Tra ve con tro moc de test tua kim bang
// cach gan lai bien, khong phai ngoi cho dong ho that.
func switchWithClock(manual bool, moc *time.Time) *Switch {
	s := New(manual)
	s.now = func() time.Time { return *moc }
	return s
}

func TestMacDinhBat(t *testing.T) {
	if !New(true).Enabled() {
		t.Error("cong tat tay bat, chua cam co lan nao thi Enabled phai true")
	}
}

func TestTatTayThangCoTuDong(t *testing.T) {
	s := New(false)
	if s.Enabled() {
		t.Fatal("cong tat tay tat thi Enabled phai false")
	}

	// Cam co roi de no het han: cong tat tay van phai giu bot tat.
	s.TripFor(time.Nanosecond)
	if s.Enabled() {
		t.Error("co tu dong het han khong duoc bat lai bot khi cong tat tay dang tat")
	}
}

func TestCoTuDongTuHetHan(t *testing.T) {
	moc := time.Date(2026, 8, 24, 10, 0, 0, 0, time.UTC)
	s := switchWithClock(true, &moc)

	s.TripFor(60 * time.Second)
	if s.Enabled() {
		t.Fatal("vua cam co thi bot phai tat")
	}

	moc = moc.Add(59 * time.Second)
	if s.Enabled() {
		t.Error("con mot giay nua moi het han ma da bat lai")
	}

	moc = moc.Add(time.Second)
	if !s.Enabled() {
		t.Error("het han thi phai tu bat lai, khong can ai goi gi")
	}
}

// Day la bay dat nhat cua thiet ke: tran global cam co toi nua dem, roi mot loi provider thoang
// qua cam them 60s. Neu TripFor ghi de thay vi noi dai thi bot song lai sau mot phut trong khi
// han muc ngay hom do da het sach.
func TestCoNganKhongCuopMocDai(t *testing.T) {
	moc := time.Date(2026, 8, 24, 10, 0, 0, 0, time.UTC)
	s := switchWithClock(true, &moc)

	s.TripFor(6 * time.Hour)
	s.TripFor(60 * time.Second)

	moc = moc.Add(2 * time.Minute)
	if s.Enabled() {
		t.Error("co 60s da rut ngan moc 6 tieng cua tran global")
	}
}

func TestTripKhongDuongThiBoQua(t *testing.T) {
	s := New(true)

	s.TripFor(0)
	if !s.Enabled() {
		t.Error("TripFor(0) khong duoc tat bot: thieu du lieu thi khong tat")
	}

	s.TripFor(-time.Hour)
	if !s.Enabled() {
		t.Error("TripFor am khong duoc tat bot")
	}
}
