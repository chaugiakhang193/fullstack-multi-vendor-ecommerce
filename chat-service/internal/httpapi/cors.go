package httpapi

import (
	"net/http"
	"strings"
)

// corsAllowlist tra ve middleware chi cho dung mot goc duy nhat: storefront.
//
// Allowlist cung theo FRONTEND_URL chu khong phai "*": endpoint nay doc header Authorization va
// dot quota Gemini, nen bat ky trang nao cung goi duoc la mo cua cho nguoi khac tieu quota cua
// minh tu domain cua ho.
//
// Preflight tra loi ngay tai day, khong di tiep vao handler.
func corsAllowlist(frontendURL string, next http.Handler) http.Handler {
	// Cat dau "/" cuoi MOT lan luc dung middleware, khong phai moi request.
	//
	// Header Origin cua trinh duyet khong bao gio co dau "/" cuoi, nhung bien FRONTEND_URL thi
	// rat de dat la "https://shop.vercel.app/". Lech dung mot ky tu do la 403 cho toan bo request
	// tu trinh duyet, va no khong lo ra o cho nao khac: cung bien do duoc SearchTool dung de dung
	// link san pham, noi ma dau "/" thua vo hai.
	allowedOrigin := strings.TrimRight(frontendURL, "/")

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		// Khong co Origin = khong phai request tu trinh duyet (curl, cron, health check): cho
		// qua, vi CORS von la co che bao ve TRINH DUYET, khong phai bao ve server.
		if origin != "" {
			if origin != allowedOrigin {
				http.Error(w, "origin khong duoc phep", http.StatusForbidden)
				return
			}
			header := w.Header()
			header.Set("Access-Control-Allow-Origin", origin)
			header.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, "+guestKeyHeader)
			header.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			header.Set("Access-Control-Max-Age", "600")
			// Origin doi thi response phai khac nhau: thieu Vary thi cache trung gian co the
			// tra header cua goc nay cho goc kia.
			header.Add("Vary", "Origin")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
