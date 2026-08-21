package httpapi

import (
	"net"
	"net/http"
	"strings"
)

// clientIPHeader la header Cloudflare ghi de bang IP cua ket noi TCP that.
//
// Render dat san edge Cloudflare truoc moi domain *.onrender.com nen chuoi thuc te la:
// Cloudflare -> load balancer Render -> container. RemoteAddr o container chi la IP noi bo cua
// Render va no DOI giua cac request - dem han muc theo no la tu tach bo dem thanh nhieu bo doc
// lap, tuc la khong chan duoc ai ca.
//
// Bai nay monolith da giai roi (backend/src/common/guard/client-ip-throttler.guard.ts); day la
// ban Go cua cung mot logic.
const clientIPHeader = "Cf-Connecting-Ip"

// forwardedForHeader la duong lui khi khong co Cloudflare (vd chay sau nginx cua chinh minh).
const forwardedForHeader = "X-Forwarded-For"

// unknownIP la gia tri cuoi cung khi khong tim ra IP nao. Tra chuoi co nghia thay vi rong de
// khoa dem khong bao gio thanh "ip:".
const unknownIP = "unknown"

// ClientIP tra ve IP that cua nguoi goi.
//
// Thu tu uu tien: cf-connecting-ip -> phan tu DAU TIEN cua x-forwarded-for -> RemoteAddr.
//
// Vi sao KHONG tin x-forwarded-for truoc: client tu dat duoc header nay. Sau Cloudflare thi
// phan tu dau van dung vi Cloudflare noi them vao chuoi, nhung neu mot ngay bo Cloudflare thi
// header do thanh duong vuot han muc mien phi. cf-connecting-ip khong co van de do vi
// Cloudflare LUON ghi de no bang IP cua ket noi TCP.
func ClientIP(r *http.Request) string {
	if ip := strings.TrimSpace(r.Header.Get(clientIPHeader)); ip != "" {
		return ip
	}

	if forwarded := r.Header.Get(forwardedForHeader); forwarded != "" {
		// Chuoi dang "14.169.17.140, 172.71.219.39, 10.30.81.130": phan tu dau la nguoi dung,
		// cac phan tu sau la cac proxy da di qua.
		first := strings.TrimSpace(strings.Split(forwarded, ",")[0])
		if first != "" {
			return first
		}
	}

	// RemoteAddr luon co dang "host:port"; cat cong di, neu khong thi cung mot nguoi dung se
	// thanh nhieu khoa dem khac nhau vi moi ket noi mot cong.
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		if r.RemoteAddr != "" {
			return r.RemoteAddr
		}
		return unknownIP
	}
	if host == "" {
		return unknownIP
	}
	return host
}
