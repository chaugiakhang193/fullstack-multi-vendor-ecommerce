// Package auth verify access token do monolith cap. Chi verify, KHONG cap token: chat-service
// khong phai nguon danh tinh.
package auth

import (
	"errors"
	"fmt"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// ErrInvalidToken la loi duy nhat tra ra ngoai. Ly do that (het han, sai chu ky, sai alg) chi
// di vao log: noi cho client biet token sai o dau la chi duong cho nguoi dang do.
var ErrInvalidToken = errors.New("auth: token khong hop le")

// Claims la phan duy nhat cua token ma chat-service dung den.
//
// Khong doc role/status tu token: monolith doc lai hai truong do tu DB moi request vi chung co
// the doi giua chung (ban tai khoan). chat-service khong co bang user nen khong lam vay duoc,
// va tin theo token la tin vao du lieu co the da cu. Chi lay danh tinh; bot khong lam gi can
// quyen.
type Claims struct {
	// UserID la sub cua token, DA chuan hoa ve dang UUID chu thuong.
	UserID string
}

// Verifier giu secret HS256 dung chung voi monolith.
type Verifier struct {
	secret []byte
}

// NewVerifier tu choi secret rong: thieu secret ma van chay nghia la moi user dang nhap am
// tham bi coi la khach vang lai va tut tu 30 luot xuong 5 luot/ngay.
func NewVerifier(secret string) (*Verifier, error) {
	if secret == "" {
		return nil, errors.New("auth: secret rong")
	}
	return &Verifier{secret: []byte(secret)}, nil
}

// Verify kiem chu ky, thuat toan va han dung cua token, tra ve danh tinh.
func (v *Verifier) Verify(token string) (Claims, error) {
	keyFunc := func(*jwt.Token) (any, error) { return v.secret, nil }

	// WithValidMethods ghim thuat toan: thieu no thi thuat toan do BEN GUI token chon, va mot
	// token HS512 ky bang dung secret van di qua duoc. Kiem nay chay truoc keyFunc nen secret
	// khong bao gio duoc dua cho mot thuat toan ngoai danh sach.
	//
	// WithExpirationRequired chan token khong co exp: mac dinh cua thu vien coi exp la tuy chon,
	// tuc mot token thieu exp la token vinh vien.
	parsed, err := jwt.Parse(token, keyFunc,
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return Claims{}, fmt.Errorf("%w: %v", ErrInvalidToken, err)
	}

	subject, err := parsed.Claims.GetSubject()
	if err != nil {
		return Claims{}, fmt.Errorf("%w: doc sub loi: %v", ErrInvalidToken, err)
	}

	// sub phai parse duoc thanh UUID: no di thang vao owner_user_id va participant.user_id, ca
	// hai deu la cot UUID. Khong kiem o day thi mot sub rac chet o tang DB, tuc la chet sau khi
	// da qua auth, da tru mot luot quota va da goi model xong.
	//
	// Lay .String() cua ket qua parse chu khong giu nguyen van sub: uuid.Parse nhan ca chu hoa
	// lan dang {...}, nen mot sub chu hoa se thanh bo dem quota va hoi thoai khac voi chinh
	// nguoi do luc ky chu thuong.
	//
	// Khong phai kiem sub rong rieng: uuid.Parse("") da la loi.
	userID, err := uuid.Parse(subject)
	if err != nil {
		return Claims{}, fmt.Errorf("%w: sub khong phai UUID: %v", ErrInvalidToken, err)
	}

	return Claims{UserID: userID.String()}, nil
}
