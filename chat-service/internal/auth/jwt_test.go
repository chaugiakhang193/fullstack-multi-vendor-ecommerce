package auth

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "secret-dung-chung-voi-monolith"

// testUserID la mot UUID that: tu 22/08 sub phai parse duoc thanh UUID nen khong dung duoc
// chuoi tuy y kieu "user-1" nua.
const testUserID = "9f2c1d3e-0000-4000-8000-000000000001"

// signWith ky mot token de test. method tach ra thanh tham so de test duoc ca nhanh alg sai.
func signWith(t *testing.T, method jwt.SigningMethod, key any, claims jwt.MapClaims) string {
	t.Helper()

	token := jwt.NewWithClaims(method, claims)
	signed, err := token.SignedString(key)
	if err != nil {
		t.Fatalf("ky token loi: %v", err)
	}
	return signed
}

// validClaims dung payload giong monolith: {sub, username, role, status, iat, exp}.
func validClaims() jwt.MapClaims {
	now := time.Now()
	return jwt.MapClaims{
		"sub":      testUserID,
		"username": "khang",
		"role":     "customer",
		"status":   "ACTIVE",
		"iat":      now.Unix(),
		"exp":      now.Add(15 * time.Minute).Unix(),
	}
}

func newTestVerifier(t *testing.T) *Verifier {
	t.Helper()

	verifier, err := NewVerifier(testSecret)
	if err != nil {
		t.Fatalf("NewVerifier loi: %v", err)
	}
	return verifier
}

func TestVerifyTokenHopLe(t *testing.T) {
	verifier := newTestVerifier(t)
	token := signWith(t, jwt.SigningMethodHS256, []byte(testSecret), validClaims())

	claims, err := verifier.Verify(token)
	if err != nil {
		t.Fatalf("Verify loi: %v", err)
	}
	if claims.UserID != testUserID {
		t.Errorf("UserID = %q, mong doi sub cua token", claims.UserID)
	}
}

func TestVerifyTuChoiChuKySai(t *testing.T) {
	verifier := newTestVerifier(t)
	token := signWith(t, jwt.SigningMethodHS256, []byte("secret-khac"), validClaims())

	if _, err := verifier.Verify(token); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("mong doi ErrInvalidToken, nhan %v", err)
	}
}

func TestVerifyTuChoiAlgNone(t *testing.T) {
	verifier := newTestVerifier(t)
	// jwt.UnsafeAllowNoneSignatureType la cach thu vien cho phep ky "none" - dung o day de
	// dung lai chinh cu tan cong kinh dien nhat vao JWT.
	token := signWith(t, jwt.SigningMethodNone, jwt.UnsafeAllowNoneSignatureType, validClaims())

	if _, err := verifier.Verify(token); !errors.Is(err, ErrInvalidToken) {
		t.Fatal("token alg=none PHAI bi tu choi")
	}
}

func TestVerifyTuChoiAlgKhacHS256(t *testing.T) {
	verifier := newTestVerifier(t)
	// Cung secret nhung HS512: chu ky hop le ve mat toan hoc, chi khac thuat toan. Neu khong
	// khai WithValidMethods thi token nay di qua duoc.
	token := signWith(t, jwt.SigningMethodHS512, []byte(testSecret), validClaims())

	if _, err := verifier.Verify(token); !errors.Is(err, ErrInvalidToken) {
		t.Fatal("token HS512 PHAI bi tu choi du dung secret")
	}
}

func TestVerifyTuChoiTokenHetHan(t *testing.T) {
	verifier := newTestVerifier(t)
	claims := validClaims()
	claims["exp"] = time.Now().Add(-time.Minute).Unix()
	token := signWith(t, jwt.SigningMethodHS256, []byte(testSecret), claims)

	if _, err := verifier.Verify(token); !errors.Is(err, ErrInvalidToken) {
		t.Fatal("token het han PHAI bi tu choi")
	}
}

func TestVerifyTuChoiTokenKhongCoExp(t *testing.T) {
	verifier := newTestVerifier(t)
	claims := validClaims()
	delete(claims, "exp")
	token := signWith(t, jwt.SigningMethodHS256, []byte(testSecret), claims)

	if _, err := verifier.Verify(token); !errors.Is(err, ErrInvalidToken) {
		t.Fatal("token khong co exp la token vinh vien, PHAI bi tu choi")
	}
}

func TestVerifyTuChoiThieuSub(t *testing.T) {
	verifier := newTestVerifier(t)
	claims := validClaims()
	delete(claims, "sub")
	token := signWith(t, jwt.SigningMethodHS256, []byte(testSecret), claims)

	if _, err := verifier.Verify(token); !errors.Is(err, ErrInvalidToken) {
		t.Fatal("khong co sub thi khong biet la ai, PHAI bi tu choi")
	}
}

// Neu khong parse sub thanh UUID o tang auth thi chuoi nay di qua duoc auth, tru mot luot
// quota, goi Gemini xong, roi moi chet luc ghi vao cot owner_user_id kieu UUID.
func TestVerifyTuChoiSubKhongPhaiUUID(t *testing.T) {
	verifier := newTestVerifier(t)
	claims := validClaims()
	claims["sub"] = "khang"
	token := signWith(t, jwt.SigningMethodHS256, []byte(testSecret), claims)

	if _, err := verifier.Verify(token); !errors.Is(err, ErrInvalidToken) {
		t.Fatal("sub khong phai UUID PHAI bi tu choi ngay tai tang auth")
	}
}

// Chuan hoa dang UUID. Khong lam viec nay thi cung mot nguoi co hai bo dem quota va hai hoi
// thoai, tuy vao monolith ky sub chu hoa hay chu thuong.
func TestVerifyChuanHoaSubVeChuThuong(t *testing.T) {
	verifier := newTestVerifier(t)
	claims := validClaims()
	claims["sub"] = strings.ToUpper(testUserID)
	token := signWith(t, jwt.SigningMethodHS256, []byte(testSecret), claims)

	got, err := verifier.Verify(token)
	if err != nil {
		t.Fatalf("Verify loi: %v", err)
	}
	if got.UserID != testUserID {
		t.Errorf("UserID = %q, mong doi %q - sub chua duoc chuan hoa", got.UserID, testUserID)
	}
}

func TestNewVerifierTuChoiSecretRong(t *testing.T) {
	if _, err := NewVerifier(""); err == nil {
		t.Fatal("secret rong PHAI la loi")
	}
}
