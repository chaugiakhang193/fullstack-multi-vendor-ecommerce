// Package quota giu cong han muc cua nhanh chatbot: ai duoc hoi, hoi bao nhieu cau moi ngay,
// va toan service duoc goi Gemini bao nhieu lan mot ngay.
//
// Package nay KHONG biet gi ve HTTP: no nhan mot Subject da dung san. Nho vay test cua no
// khong can dung request gia, va tang handler chi viec dich request thanh Subject.
package quota

import (
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// ICT la mui gio dung de cat "ngay" va "gio" cua han muc.
//
// FixedZone chu khong phai time.LoadLocation("Asia/Ho_Chi_Minh"): Viet Nam khong co DST tu
// 1975 nen offset co dinh la dung ve nghiep vu, va khong phai phu thuoc vao tzdata co nam
// trong image hay khong. Phu thuoc do neu hong thi hong LUC CHAY tren prod chu khong hong luc
// build - loai loi kho thay nhat.
var ICT = time.FixedZone("ICT", 7*60*60)

// globalKey la khoa dem cua tran toan service. Khong co tien to ":" vi no khong dinh danh ai
// ca - day la bo dem duy nhat khong thuoc ve mot nguoi dung nao.
const globalKey = "global"

// inFlightRetryAfter la khoang thoi gian goi y client thu lai khi bi chan boi co dang-chay.
// Ngan, vi cau tra loi truoc thuong xong trong vai giay.
const inFlightRetryAfter = 3 * time.Second

// Subject la doi tuong bi tinh han muc. UserID rong = khach vang lai, khi do dem theo IP.
//
// Dem khach theo IP chu khong theo guest_key trong localStorage: xoa localStorage la mot cu
// bam, doi IP thi kho hon nhieu.
type Subject struct {
	UserID string
	IP     string
}

// IsGuest bao subject nay la khach vang lai hay tai khoan da dang nhap.
func (s Subject) IsGuest() bool {
	return s.UserID == ""
}

// dayKey la khoa dem theo NGAY cua subject.
func (s Subject) dayKey() string {
	if s.IsGuest() {
		return "ip:" + s.IP
	}
	return "user:" + s.UserID
}

// hourKey la khoa dem theo GIO, chi dung cho tai khoan da dang nhap.
//
// Gio nhet vao KHOA thay vi them cot hay bang moi: primary key cua bot_usage_daily la
// (subject_key, usage_date) nen mot khoa mang so gio da du tach bucket. Phan ngay da nam o
// usage_date roi nen khoa chi can hai chu so gio.
func (s Subject) hourKey(now time.Time) string {
	return fmt.Sprintf("userhour:%s:%02d", s.UserID, now.In(ICT).Hour())
}

// Limits la bo han muc doc tu config.
type Limits struct {
	GuestDaily  int32
	UserDaily   int32
	UserHourly  int32
	GlobalDaily int32
}

// Reason cho biet vi sao mot request bi tu choi. Chuoi chu khong phai so de no dung luon duoc
// lam nhan metric va lam ma loi tra ve FE ma khong phai map lai.
type Reason string

const (
	ReasonOK       Reason = "ok"
	ReasonInFlight Reason = "in_flight"
	// ReasonBurst: bam qua nhanh. Khac ReasonInFlight o cho in_flight noi "cau truoc chua xong",
	// con burst noi "cau truoc xong roi nhung ban dang bam nhanh hon nguoi that".
	ReasonBurst       Reason = "burst"
	ReasonGuestDaily  Reason = "guest_daily"
	ReasonUserHourly  Reason = "user_hourly"
	ReasonUserDaily   Reason = "user_daily"
	ReasonGlobalDaily Reason = "global_daily"
)

// Decision la ket qua cua mot lan xin luot.
type Decision struct {
	Allowed bool
	Reason  Reason

	// Remaining la so luot con lai cua tang CHAT NHAT dang ap. FE hien "con N luot" nen day
	// phai la con so that se chan nguoi dung, khong phai con so dep nhat trong ba tang.
	Remaining int32

	// RetryAfter la goi y cho header Retry-After. Chan theo gio thi cho toi dau gio sau, chan
	// theo ngay thi cho toi nua dem ICT.
	RetryAfter time.Duration
}

// deny dung mot Decision tu choi. Remaining luon 0: da cham tran thi khong con luot nao.
func deny(reason Reason, retryAfter time.Duration) Decision {
	return Decision{Allowed: false, Reason: reason, RetryAfter: retryAfter}
}

// dateOf doi mot moc thoi gian thanh NGAY LICH theo ICT de ghi vao cot usage_date.
//
// Thu tu quan trong la .In(ICT) TRUOC khi lay Year/Month/Day: bo no thi 5h sang gio Viet Nam
// (22:00 UTC hom truoc) bi tinh sang ngay hom qua, va lech dung khung 0h-7h sang - khung it ai
// ngoi test nhat.
//
// Moc nua dem dat o time.UTC la QUY UOC chu khong phai dieu kien dung sai: pgx v5 encode date
// bang cach lay Y/M/D cua moc theo location cua chinh no roi dung lai o UTC
// (pgtype/date.go, encodePlanDateCodecBinary), nen dat ICT o day cung cho ra cung mot ngay.
// Dung UTC cho khop voi cach driver lam va cho khoi phai nghi lai lan sau.
func dateOf(now time.Time) pgtype.Date {
	local := now.In(ICT)
	midnight := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
	return pgtype.Date{Time: midnight, Valid: true}
}

// untilNextDay tra ve thoi gian con lai toi nua dem ICT ke tiep.
func untilNextDay(now time.Time) time.Duration {
	local := now.In(ICT)
	// time.Date tu chuan hoa ngay tran (32/08 thanh 01/09) nen khong phai xu ly cuoi thang.
	next := time.Date(local.Year(), local.Month(), local.Day()+1, 0, 0, 0, 0, ICT)
	return next.Sub(now)
}

// untilNextHour tra ve thoi gian con lai toi dau gio ICT ke tiep.
func untilNextHour(now time.Time) time.Duration {
	local := now.In(ICT)
	next := time.Date(local.Year(), local.Month(), local.Day(), local.Hour()+1, 0, 0, 0, ICT)
	return next.Sub(now)
}

// tierOf tra ve ten tang tu mot khoa dem, dung cho log va thong bao loi.
//
// Ton tai de KHONG bao gio ghi nguyen van subject_key vao log: khoa cua khach chua dia chi IP
// that.
//
// Nhanh "userhour:" phai dung TRUOC bat ky phep so tien to "user:" nao vi userhour cung bat
// dau bang user; o day tranh han bang cach de user_daily lam nhanh default.
func tierOf(key string) string {
	switch {
	case key == globalKey:
		return "global"
	case strings.HasPrefix(key, "ip:"):
		return "guest_daily"
	case strings.HasPrefix(key, "userhour:"):
		return "user_hourly"
	default:
		return "user_daily"
	}
}
