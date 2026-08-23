package httpapi

import (
	"log/slog"
	"net/http"
)

// configHandler tra ve cac co ma storefront phai biet TRUOC khi ve giao dien.
//
// Endpoint nay ton tai vi /health khong dung duoc cho viec do: /health co y khong boc CORS nen
// trinh duyet goi khong duoc, va no tra "ok" ke ca khi kill switch dang tat bot.
//
// KHONG doc DB de tra kem so luot con lai: widget mount tren MOI trang khach, nen mot lan doc bo
// dem la mot lan doc Neon cho moi luot tai trang. So luot van di theo event meta cua chinh cau
// tra loi, la cho no vua duoc tinh xong.
func configHandler(enabled bool, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// no-store vi kill switch la thu duoc bat len giua su co: mot ban tra loi cu nam trong
		// cache trinh duyet nghia la widget van an di sau khi bot da bat lai.
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, logger, http.StatusOK, map[string]bool{"enabled": enabled})
	}
}
