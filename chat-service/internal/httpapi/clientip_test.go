package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func requestWith(headers map[string]string, remoteAddr string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, "/chat/bot", nil)
	for name, value := range headers {
		r.Header.Set(name, value)
	}
	r.RemoteAddr = remoteAddr
	return r
}

func TestClientIPUuTienCloudflare(t *testing.T) {
	r := requestWith(map[string]string{
		"Cf-Connecting-Ip": "14.169.17.140",
		"X-Forwarded-For":  "1.2.3.4, 172.71.219.39",
	}, "10.30.81.130:54321")

	if got := ClientIP(r); got != "14.169.17.140" {
		t.Errorf("ClientIP = %q, mong doi %q - dang khong uu tien cf-connecting-ip", got, "14.169.17.140")
	}
}

func TestClientIPCatKhoangTrang(t *testing.T) {
	r := requestWith(map[string]string{"Cf-Connecting-Ip": "  14.169.17.140  "}, "10.30.81.130:54321")

	if got := ClientIP(r); got != "14.169.17.140" {
		t.Errorf("ClientIP = %q, mong doi %q - khoang trang lam hai khoa dem cho cung mot nguoi",
			got, "14.169.17.140")
	}
}

func TestClientIPHeaderRongThiRoiXuongLopSau(t *testing.T) {
	r := requestWith(map[string]string{
		"Cf-Connecting-Ip": "   ",
		"X-Forwarded-For":  "14.169.17.140, 172.71.219.39",
	}, "10.30.81.130:54321")

	if got := ClientIP(r); got != "14.169.17.140" {
		t.Errorf("ClientIP = %q, mong doi phan tu dau cua x-forwarded-for", got)
	}
}

func TestClientIPLayPhanTuDauCuaForwardedFor(t *testing.T) {
	r := requestWith(map[string]string{
		"X-Forwarded-For": "14.169.17.140, 172.71.219.39, 10.30.81.130",
	}, "10.30.81.130:54321")

	if got := ClientIP(r); got != "14.169.17.140" {
		t.Errorf("ClientIP = %q, mong doi %q - phan tu DAU moi la nguoi dung", got, "14.169.17.140")
	}
}

func TestClientIPFallbackRemoteAddrBoCong(t *testing.T) {
	r := requestWith(nil, "192.168.1.7:54321")

	if got := ClientIP(r); got != "192.168.1.7" {
		t.Errorf("ClientIP = %q, mong doi %q - cong phai bi cat, neu khong moi ket noi thanh mot khoa moi",
			got, "192.168.1.7")
	}
}

func TestClientIPKhongCoGiThiTraUnknown(t *testing.T) {
	r := requestWith(nil, "")

	if got := ClientIP(r); got != unknownIP {
		t.Errorf("ClientIP = %q, mong doi %q", got, unknownIP)
	}
}
