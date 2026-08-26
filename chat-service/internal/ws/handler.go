package ws

import (
	"context"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/auth"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/quota"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/shopclient"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/store"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

const (
	// authDeadline: han gui frame auth ke tu luc bat tay xong.
	//
	// Ngan la co y. Truoc khi gui frame do, ket noi chua co danh tinh nao - khong biet ai, khong
	// tinh duoc han muc, khong gan duoc vao phong nao. Cho lau nghia la cho phep mot ket noi vo
	// danh nam giu tai nguyen cua service.
	authDeadline = 5 * time.Second

	// pingEvery 30s: Render dong ket noi im lang qua ~100s, va mot so proxy cua nha mang con
	// ngan hon. Ping la thu duy nhat giu duong song ma khong can nguoi dung go gi.
	pingEvery = 30 * time.Second

	// readLimit 8KB: mot tin nhan toi da 4000 ky tu, cong JSON escape va cac truong con lai van
	// khong toi 8KB. Dat gioi han o day de mot frame khong lo doc het bo nho truoc khi ai kip
	// kiem no.
	readLimit = 8 << 10

	// closeUnauthorized la ma dong rieng cho "danh tinh khong dung".
	//
	// 4401 chu khong phai 1008 (policy violation): day la ma trong vung danh cho ung dung, va FE
	// can phan biet "token het han, di refresh roi noi lai" voi moi ly do dong khac - noi lai
	// ngay bang token cu la mot vong lap vo tan.
	closeUnauthorized = websocket.StatusCode(4401)

	// DefaultBurstCapacity / DefaultBurstRefill la tran toc do cua duong ghi chat 1-1.
	//
	// Rong hon nhieu so voi bot (10 cau, 6s/luot) vi day la go phim cho mot nguoi that chu khong
	// phai goi mot API tinh tien. 20 tin lien tiep la mot cuoc noi chuyen soi noi; 20 tin trong
	// mot giay la mot vong lap.
	DefaultBurstCapacity = 20
	DefaultBurstRefill   = time.Second
)

// Deps gom moi thu duong realtime can. Cung khuon voi httpapi.ChatDeps: mot struct thay vi sau
// tham so, de them phu thuoc sau nay khong phai sua chu ky o ba cho.
type Deps struct {
	Hub      *Hub
	Store    *store.Store
	Shops    *shopclient.Client
	Verifier *auth.Verifier
	Logger   *slog.Logger

	// Burst la tran toc do cua duong ghi. Bat buoc khac nil: de nil thi cua nay bien mat lang le
	// va khong test nao bat duoc - dung ly do Burst cua BotDeps bat buoc khac nil.
	Burst *quota.Burst
}

// Handler tra ve http.Handler phuc vu GET /ws.
//
// frontendURL truyen rieng chu khong nam trong Deps: no la cau hinh cua cong vao, khong phai mot
// phu thuoc ma duong ghi goi toi.
func Handler(deps Deps, frontendURL string) http.Handler {
	allowedOrigin := originHost(frontendURL)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		socket, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			OriginPatterns: []string{allowedOrigin},
		})
		if err != nil {
			// Accept da tra loi HTTP roi (403 neu goc sai, 400 neu khong phai request nang cap).
			// O day chi con ghi lai ly do - va day la dong log duy nhat noi duoc "goc bi tu choi".
			deps.Logger.Warn("nang cap websocket that bai", "err", err, "origin", r.Header.Get("Origin"))
			return
		}
		socket.SetReadLimit(readLimit)

		conn := newConn(socket, deps.Logger)
		// CloseNow la luoi cuoi cung: moi duong thoat co chu y deu da goi Close voi ma rieng, cai
		// nay chi de khong ro ri socket khi co mot duong thoat chua nghi ra.
		defer func() { _ = socket.CloseNow() }()

		ctx, cancel := context.WithCancel(r.Context())
		defer cancel()

		go conn.writeLoop(ctx)

		if !authenticate(ctx, deps, conn) {
			return
		}

		deps.Hub.Join(conn, UserKey(conn.UserID), ShopKey(conn.ShopID))
		defer deps.Hub.Leave(conn)

		conn.Send(serverFrame{Type: frameReady, UserID: conn.UserID, ShopID: conn.ShopID})

		go pingLoop(ctx, conn)

		readLoop(ctx, deps, conn)
	})
}

// authenticate doc frame dau tien va chot danh tinh cua ket noi.
//
// Tra false nghia la ket noi da bi dong kem ly do; ben goi chi viec thoat.
//
// Doc trong mot goroutine rieng roi dua voi time.After, khong truyen thang mot context co han
// vao wsjson.Read: coder/websocket dong cung ca ket noi (khong gui close frame nao) ngay khi
// context do het han, nen ma dong 4401 se khong bao gio toi duoc client - client chi thay mot
// ket noi dut ngang. Tu dat timer thi luc no het han, ket noi con song de Close gui frame that.
func authenticate(ctx context.Context, deps Deps, conn *Conn) bool {
	type readResult struct {
		frame clientFrame
		err   error
	}
	readDone := make(chan readResult, 1)
	go func() {
		var frame clientFrame
		err := wsjson.Read(ctx, conn.socket, &frame)
		readDone <- readResult{frame, err}
	}()

	var frame clientFrame
	select {
	case <-time.After(authDeadline):
		conn.Close(closeUnauthorized, "thieu frame auth")
		return false
	case result := <-readDone:
		if result.err != nil {
			// Gui rac khong phai JSON hoac dong tab ngay deu roi vao day, cung ma dong voi
			// truong hop im lang qua han o nhanh tren.
			conn.Close(closeUnauthorized, "thieu frame auth")
			return false
		}
		frame = result.frame
	}

	if frame.Type != frameAuth || frame.Token == "" {
		conn.Close(closeUnauthorized, "frame dau tien phai la auth")
		return false
	}

	claims, err := deps.Verifier.Verify(frame.Token)
	if err != nil {
		conn.Close(closeUnauthorized, "token khong hop le")
		return false
	}
	conn.UserID = claims.UserID

	// Hoi shop MOT lan luc ket noi chu khong moi lan gui tin: quan he seller-shop gan nhu khong
	// doi, shopclient da cache 10 phut, va mot vong mang nam giua hai nguoi dang nhan tin la cho
	// te nhat de dat no.
	//
	// Loi mang o day KHONG chan ket noi: nguoi nay van chat duoc voi tu cach buyer, chi la khong
	// nhan duoc tin gui toi shop cua ho cho toi lan ket noi sau. Chan hang thi mot su co ben
	// monolith keo sap luon duong chat 1-1 cua moi nguoi.
	shopID, err := deps.Shops.ShopIDFor(ctx, claims.UserID, frame.Token)
	if err != nil {
		deps.Logger.Warn("hoi shop luc mo websocket loi", "err", err, "userId", claims.UserID)
	}
	conn.ShopID = shopID

	return true
}

// pingLoop giu ket noi song qua cac proxy hay cat duong im lang.
//
// Ping di bang CONTROL frame, ma coder/websocket khoa control frame rieng voi data frame - no
// khong pha vo luat "mot goroutine ghi duy nhat" cua writeLoop.
func pingLoop(ctx context.Context, conn *Conn) {
	ticker := time.NewTicker(pingEvery)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-conn.done:
			return
		case <-ticker.C:
			pingCtx, cancel := context.WithTimeout(ctx, writeTimeout)
			err := conn.socket.Ping(pingCtx)
			cancel()
			if err != nil {
				// Khong ping duoc = dau kia da di roi, chi chua ai bao. Dong de Leave chay va
				// phong khong con giu mot ket noi ma.
				conn.Close(websocket.StatusGoingAway, "khong ping duoc")
				return
			}
		}
	}
}

// readLoop doc frame cho toi khi ket noi dut.
func readLoop(ctx context.Context, deps Deps, conn *Conn) {
	for {
		var frame clientFrame
		if err := wsjson.Read(ctx, conn.socket, &frame); err != nil {
			// Dong tab, mat mang, gui rac, hoac vuot readLimit: bon truong hop deu ket thuc vong
			// doc va deu la ket cuc binh thuong cua mot ket noi WebSocket.
			return
		}

		switch frame.Type {
		default:
			// Tra loi thay vi lo di: mot FE gui nham type ma khong nhan duoc gi se treo cho mot
			// phan hoi khong bao gio toi.
			conn.sendError("unsupported_type", frame.ClientMsgID)
		}
	}
}

// originHost cat FRONTEND_URL con lai phan host de doi chieu header Origin.
//
// coder/websocket so khop OriginPatterns theo HOST, khong phai ca URL: dua nguyen
// "https://shop.vercel.app" vao thi khong khop gi ca va MOI ket noi tu trinh duyet bi tu choi -
// trong khi curl va wscat (khong gui Origin) van chay ngon. Lech dung mot ky tu, va no chi lo ra
// tren trinh duyet that.
func originHost(frontendURL string) string {
	parsed, err := url.Parse(frontendURL)
	if err != nil || parsed.Host == "" {
		// Cau hinh da la host tran (vd "localhost:3000"): dung nguyen. Tra chuoi rong o day thi
		// khong con goc nao duoc phep va ca duong chat im lang.
		return frontendURL
	}
	return parsed.Host
}
