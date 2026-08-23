package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/auth"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/quota"
)

const (
	// guestKeyHeader mang dinh danh tab cua khach vang lai, FE sinh va giu trong localStorage.
	//
	// Di bang HEADER chu khong phai body: subject phai giai xong TRUOC khi doc body, vi quota
	// can chan ca nhung request co body rac.
	guestKeyHeader = "X-Guest-Key"

	// minGuestKeyLen 16 chu khong phai 8: khoa nay la bi mat duy nhat bao ve hoi thoai cua mot
	// khach vang lai, va tu khi co GET /chat/history thi doan trung khoa la DOC DUOC nguyen hoi
	// thoai cua nguoi khac, khong con chi la lam ban ngu canh model nua. FE sinh khoa bang
	// crypto.randomUUID() - 122 bit ngau nhien, khong phai 16 ky tu tu chon.
	//
	// Toi da 64 de mot header dai bat thuong khong di thang vao cot owner_guest_key va vao khoa
	// unique index.
	minGuestKeyLen = 16
	maxGuestKeyLen = 64
)

// ErrUnauthorized: co Authorization nhung token khong dung duoc.
var ErrUnauthorized = errors.New("httpapi: token khong hop le")

// resolveSubject dung doi tuong tinh han muc tu request, kem guest_key neu la khach.
//
// Token sai/het han tra LOI chu khong am tham tut xuong khach: nguoi dung dang nhap ma bong
// dung con 5 luot/ngay theo IP la thu khong ai doan ra duoc. 401 de FE refresh roi gui lai.
func resolveSubject(r *http.Request, verifier *auth.Verifier) (quota.Subject, string, error) {
	clientIP := ClientIP(r)

	token := bearerToken(r)
	if token == "" {
		// Khach vang lai. guestKey co the rong: khi do khong luu lich su, van tra loi duoc.
		return quota.Subject{IP: clientIP}, guestKeyFrom(r), nil
	}

	claims, err := verifier.Verify(token)
	if err != nil {
		return quota.Subject{}, "", ErrUnauthorized
	}
	// Da dang nhap thi dem theo tai khoan, khong theo IP: nguoc lai ca phong net hoac ca van
	// phong dung chung mot han muc.
	//
	// Van dien IP du Subject.dayKey/hourKey khong doc no o nhanh nay: hien la du lieu mang theo,
	// chua ai tieu thu. Giu vi ClientIP(r) da goi san o tren nen khong ton them gi, va khi phai
	// lan mot tai khoan lam dung thi do la manh moi duy nhat con lai.
	//
	// Luu y neu co ngay dung den: package quota co y khong ghi IP vao log (xem tierOf), nen cho
	// dung phai duoc chon co chu dich.
	return quota.Subject{UserID: claims.UserID, IP: clientIP}, "", nil
}

// bearerToken lay token tu header Authorization, hoac chuoi rong neu khong co.
func bearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	const prefix = "Bearer "
	// EqualFold vi mot so client gui "bearer" thuong.
	if len(header) <= len(prefix) || !strings.EqualFold(header[:len(prefix)], prefix) {
		return ""
	}
	return strings.TrimSpace(header[len(prefix):])
}

// guestKeyFrom doc va validate X-Guest-Key. Khong hop le thi tra chuoi rong chu khong tra loi:
// khoa hong chi lam mat lich su, khong dang chan mot cau hoi hop le.
func guestKeyFrom(r *http.Request) string {
	key := strings.TrimSpace(r.Header.Get(guestKeyHeader))
	if len(key) < minGuestKeyLen || len(key) > maxGuestKeyLen {
		return ""
	}
	for _, c := range key {
		isAllowed := (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
			(c >= '0' && c <= '9') || c == '-' || c == '_'
		if !isAllowed {
			return ""
		}
	}
	return key
}
