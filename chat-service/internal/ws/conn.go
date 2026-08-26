package ws

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/coder/websocket"
)

const (
	// outboxSize la so frame duoc xep hang cho mot ket noi truoc khi coi nhu client qua cham.
	//
	// Nho la co y. Mot hoi thoai 1-1 nhan vai frame moi phut; xep du 16 frame ma van chua ghi
	// duoc nghia la duong truyen do da hong chu khong phai dang ban. Hang doi dai chi lam RAM
	// cua service phinh theo so client hong.
	outboxSize = 16

	// writeTimeout: mot lan ghi mot frame vai tram byte. Qua 10s la ket noi chet chu khong phai
	// mang cham.
	writeTimeout = 10 * time.Second
)

// Conn la mot ket noi WebSocket da xac thuc, kem hang doi ghi rieng.
//
// Vi sao co hang doi thay vi ghi thang: coder/websocket chi cho MOT nguoi ghi data frame tai mot
// thoi diem, ma fanout chay tu goroutine cua NGUOI GUI - hai nguoi cung nhan mot tin la hai
// goroutine cung ghi vao hai ket noi khac nhau, va cac tab cua cung mot nguoi thi la hai
// goroutine cung ghi vao MOT ket noi. Mot goroutine ghi duy nhat cho moi ket noi bien rang buoc
// do thanh dieu khong the vi pham, thay vi mot mutex ai cung phai nho khoa.
type Conn struct {
	socket *websocket.Conn
	logger *slog.Logger

	// UserID va ShopID chot mot lan luc auth xong, sau do chi doc - khong can khoa.
	UserID string
	ShopID string

	outbox chan []byte

	// closeOnce vi ca goroutine doc, goroutine ghi lan goroutine ping deu co the phat hien ket
	// noi chet. Dong hai lan khong panic, nhung close(done) hai lan thi co.
	closeOnce sync.Once
	done      chan struct{}
}

// newConn boc mot socket vua bat tay xong. Chua co danh tinh: danh tinh den o frame auth.
func newConn(socket *websocket.Conn, logger *slog.Logger) *Conn {
	return &Conn{
		socket: socket,
		logger: logger,
		outbox: make(chan []byte, outboxSize),
		done:   make(chan struct{}),
	}
}

// Send xep mot frame vao hang doi ghi. KHONG BAO GIO chan nguoi goi.
//
// Day la diem quan trong nhat cua ca file: Send duoc goi tu goroutine cua nguoi GUI tin, nen mot
// client cham ma lam Send chan lai se lam dong bang luon nguoi da gui tin cho no.
func (c *Conn) Send(frame serverFrame) {
	payload, err := json.Marshal(frame)
	if err != nil {
		c.logger.Error("dong goi frame loi", "err", err, "type", frame.Type)
		return
	}

	select {
	case c.outbox <- payload:
	case <-c.done:
		// Ket noi da dong: bo frame la dung, khong phai loi.
	default:
		// Hang doi day = client khong theo kip. Dong ket noi thay vi bo qua frame: bo qua thi hai
		// ben nhin thay hai lich su khac nhau ma khong ai bao gi, con dong thi FE biet duong ket
		// noi lai va tai lai lich su bang HTTP.
		c.logger.Warn("hang doi ghi day, dong ket noi", "userId", c.UserID)
		c.Close(websocket.StatusPolicyViolation, "client qua cham")
	}
}

// sendError la loi tat cho frame error, kem clientMsgId de FE biet tin nao that bai.
func (c *Conn) sendError(reason, clientMsgID string) {
	c.Send(serverFrame{Type: frameError, Reason: reason, ClientMsgID: clientMsgID})
}

// writeLoop la goroutine ghi DUY NHAT cua ket noi. Ket thuc khi ket noi dong hoac ctx bi huy.
func (c *Conn) writeLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-c.done:
			return
		case payload := <-c.outbox:
			writeCtx, cancel := context.WithTimeout(ctx, writeTimeout)
			err := c.socket.Write(writeCtx, websocket.MessageText, payload)
			cancel()
			if err != nil {
				// Khong log Error: ket noi dut la chuyen binh thuong cua WebSocket (dong tab,
				// mat song, doi mang). Log muc do do se lam day log bang su kien khong ai xu ly.
				c.Close(websocket.StatusInternalError, "ghi that bai")
				return
			}
		}
	}
}

// Close dong ket noi dung mot lan, kem ma dong va ly do.
func (c *Conn) Close(code websocket.StatusCode, reason string) {
	c.closeOnce.Do(func() {
		close(c.done)
		// Bo qua loi: den day thi ket noi hoac da dong roi, hoac dang dong - ca hai deu khong
		// con gi de lam tiep.
		_ = c.socket.Close(code, reason)
	})
}
