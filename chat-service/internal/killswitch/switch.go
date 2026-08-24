// Package killswitch giu cong tat cua nhanh chatbot: mot cong tat tay dat luc khoi dong va mot
// co tu dong duoc cam ngay tai cho phat hien su co.
//
// Package nay KHONG biet gi ve HTTP lan han muc - no chi nhan mot khoang thoi gian phai nghi.
// Nho vay test cua no khong can request gia va khong cham DB.
package killswitch

import (
	"sync"
	"time"
)

// Switch gom hai lop khoa doc lap nhau.
//
// manual doc tu CHAT_BOT_ENABLED luc boot va khong doi khi chay: process khong sua duoc bien moi
// truong cua chinh no tren Render, va doi bien moi truong la mot lan redeploy - 2-3 phut cong
// cold start chi de bat mot cai co.
//
// Co tu dong nam CANH cong tat tay chu khong thay the no: van phai tat bot duoc vi ly do khong
// lien quan gi toi han muc, vi du bot tra loi bay.
type Switch struct {
	manual bool

	mu sync.Mutex

	// autoUntil la moc co tu dong het hieu luc. Moc zero doc duoc luon la "da qua" nen khong
	// phai co them mot truong bool di kem de biet co dang cam hay khong.
	autoUntil time.Time

	// now tach thanh truong de test tiem duoc moc thoi gian (dung luc co het han, nua dem) ma
	// khong phai ngoi cho dong ho that.
	now func() time.Time
}

// New dung cong tat voi trang thai cua cong tat tay.
func New(manual bool) *Switch {
	return &Switch{manual: manual, now: time.Now}
}

// Enabled bao bot co dang nhan cau hoi khong.
//
// Goi tren MOI request cua /chat/config lan /chat/bot nen khong duoc cham DB hay mang - day la
// ly do co nam trong RAM chu khong phai mot cot trong bang.
func (s *Switch) Enabled() bool {
	// Tat tay thi khong can xem co tu dong: mot lop khoa dong la du, va nhanh nay khong phai
	// gianh lock.
	if !s.manual {
		return false
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	return !s.now().Before(s.autoUntil)
}

// TripFor tat bot tu dong trong d.
//
// Chi NOI DAI, khong bao gio rut ngan: mot lan tat 60s vi provider chap chon khong duoc cuop mat
// moc "het tran global, nghi toi nua dem" da cam truoc do.
//
// d khong duong thi bo qua chu khong tat vinh vien: mot Decision khong co RetryAfter la thieu du
// lieu, ma tat bot vo thoi han vi thieu du lieu la hanh vi te nhat co the chon.
func (s *Switch) TripFor(d time.Duration) {
	if d <= 0 {
		return
	}

	until := s.now().Add(d)

	s.mu.Lock()
	defer s.mu.Unlock()
	if until.After(s.autoUntil) {
		s.autoUntil = until
	}
}
