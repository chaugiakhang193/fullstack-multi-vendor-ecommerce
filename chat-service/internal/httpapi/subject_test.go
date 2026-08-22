package httpapi

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/auth"
	"github.com/golang-jwt/jwt/v5"
)

const testJWTSecret = "secret-dung-chung-voi-monolith"

// testSubjectUserID phai la UUID that: auth.Verify tu choi sub khong parse duoc (quyet dinh #13).
const testSubjectUserID = "9f2c1d3e-0000-4000-8000-000000000001"

// testGuestKey dai 20 ky tu de qua duoc minGuestKeyLen = 16.
const testGuestKey = "guest-abc123def456xy"

func testVerifier(t *testing.T) *auth.Verifier {
	t.Helper()

	verifier, err := auth.NewVerifier(testJWTSecret)
	if err != nil {
		t.Fatalf("NewVerifier loi: %v", err)
	}
	return verifier
}

func signedToken(t *testing.T, subject string, ttl time.Duration) string {
	t.Helper()

	claims := jwt.MapClaims{
		"sub": subject,
		"exp": time.Now().Add(ttl).Unix(),
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testJWTSecret))
	if err != nil {
		t.Fatalf("ky token loi: %v", err)
	}
	return signed
}

func TestResolveSubjectKhachTheoIP(t *testing.T) {
	r := requestWith(map[string]string{"Cf-Connecting-Ip": "14.169.17.140"}, "10.0.0.1:1234")

	subject, guestKey, err := resolveSubject(r, testVerifier(t))
	if err != nil {
		t.Fatalf("resolveSubject loi: %v", err)
	}
	if !subject.IsGuest() {
		t.Error("khong co token thi phai la khach")
	}
	if subject.IP != "14.169.17.140" {
		t.Errorf("IP = %q, mong doi IP that sau Cloudflare", subject.IP)
	}
	if guestKey != "" {
		t.Errorf("guestKey = %q, mong doi rong khi khong gui header", guestKey)
	}
}

func TestResolveSubjectUserTheoTaiKhoan(t *testing.T) {
	r := requestWith(map[string]string{
		"Cf-Connecting-Ip": "14.169.17.140",
		"Authorization":    "Bearer " + signedToken(t, testSubjectUserID, 15*time.Minute),
	}, "10.0.0.1:1234")

	subject, guestKey, err := resolveSubject(r, testVerifier(t))
	if err != nil {
		t.Fatalf("resolveSubject loi: %v", err)
	}
	if subject.IsGuest() {
		t.Fatal("co token hop le thi khong duoc coi la khach")
	}
	if subject.UserID != testSubjectUserID {
		t.Errorf("UserID = %q, mong doi %q", subject.UserID, testSubjectUserID)
	}
	// IP van duoc dien du quota KHONG dem theo no o nhanh user (dayKey dung "user:<uuid>").
	// Test nay khoa chu dich "van thu thap", khong khoa mot hanh vi dang co nguoi tieu thu -
	// hien chua co. Xem comment o resolveSubject.
	if subject.IP != "14.169.17.140" {
		t.Errorf("IP = %q, mong doi van duoc dien de con manh moi khi phai lan lam dung", subject.IP)
	}
	if guestKey != "" {
		t.Errorf("guestKey = %q, user dang nhap khong dung guest_key", guestKey)
	}
}

func TestResolveSubjectTokenHongThiLoiChuKhongTutXuongKhach(t *testing.T) {
	r := requestWith(map[string]string{
		"Authorization": "Bearer " + signedToken(t, testSubjectUserID, -time.Minute),
	}, "10.0.0.1:1234")

	_, _, err := resolveSubject(r, testVerifier(t))
	if !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("mong doi ErrUnauthorized, nhan %v - token het han dang bi coi la khach", err)
	}
}

func TestGuestKeyValidate(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want string
	}{
		{name: "hop le", raw: testGuestKey, want: testGuestKey},
		{name: "cat khoang trang", raw: "  " + testGuestKey + "  ", want: testGuestKey},
		// Do dai viet CUNG chu khong phai minGuestKeyLen-1: viet theo hang so thi ha nguong
		// xuong 8 se keo chuoi test ngan theo va test van xanh - tuc la khong kiem gi ca.
		// 12 ky tu: qua nguong 8 cu, duoi nguong 16 moi.
		{name: "12 ky tu la qua ngan", raw: "abc123def456", want: ""},
		{name: "dung 16 ky tu", raw: "abc123def456ghij", want: "abc123def456ghij"},
		{name: "qua dai", raw: strings.Repeat("a", maxGuestKeyLen+1), want: ""},
		// Ky tu la se di thang vao cot owner_guest_key va vao khoa unique index.
		{name: "ky tu la", raw: "abc123!@#$%^&*()_+", want: ""},
		{name: "khoang trang giua", raw: "abc 123 xyz abc 123", want: ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := requestWith(map[string]string{guestKeyHeader: tc.raw}, "10.0.0.1:1234")
			if got := guestKeyFrom(r); got != tc.want {
				t.Errorf("guestKeyFrom = %q, mong doi %q", got, tc.want)
			}
		})
	}
}

func TestBearerTokenChapNhanChuThuong(t *testing.T) {
	r := requestWith(map[string]string{"Authorization": "bearer abc.def.ghi"}, "10.0.0.1:1234")

	if got := bearerToken(r); got != "abc.def.ghi" {
		t.Errorf("bearerToken = %q, mong doi %q", got, "abc.def.ghi")
	}
}

func TestBearerTokenBoQuaScheKhac(t *testing.T) {
	r := requestWith(map[string]string{"Authorization": "Basic YWJjOmRlZg=="}, "10.0.0.1:1234")

	if got := bearerToken(r); got != "" {
		t.Errorf("bearerToken = %q, mong doi rong voi scheme khac Bearer", got)
	}
}

func TestBearerTokenBoQuaHeaderChiCoTuBearer(t *testing.T) {
	r := requestWith(map[string]string{"Authorization": "Bearer"}, "10.0.0.1:1234")

	if got := bearerToken(r); got != "" {
		t.Errorf("bearerToken = %q, mong doi rong", got)
	}
}
