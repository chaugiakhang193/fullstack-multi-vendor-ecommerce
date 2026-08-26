package ws

import (
	"log/slog"
	"testing"
)

// newTestConn dung mot Conn khong co socket that.
//
// Lam duoc vi Send chi cham toi outbox va done - hai thu thuan bo nho. Ca Hub vi vay test duoc
// ma khong can mo mot ket noi mang nao.
func newTestConn() *Conn {
	return &Conn{
		logger: slog.Default(),
		outbox: make(chan []byte, outboxSize),
		done:   make(chan struct{}),
	}
}

// drain doc het frame dang xep hang cua mot ket noi.
func drain(c *Conn) [][]byte {
	frames := make([][]byte, 0, len(c.outbox))
	for {
		select {
		case payload := <-c.outbox:
			frames = append(frames, payload)
		default:
			return frames
		}
	}
}

func TestHubBroadcastToiDungPhong(t *testing.T) {
	hub := NewHub()

	buyer := newTestConn()
	seller := newTestConn()
	nguoiLa := newTestConn()

	hub.Join(buyer, UserKey("buyer-1"))
	hub.Join(seller, ShopKey("shop-1"))
	hub.Join(nguoiLa, UserKey("buyer-2"))

	hub.Broadcast(ShopKey("shop-1"), nil, serverFrame{Type: frameMessage, Text: "chao shop"})

	if got := len(drain(seller)); got != 1 {
		t.Errorf("seller nhan %d frame, mong doi 1", got)
	}
	if got := len(drain(nguoiLa)); got != 0 {
		t.Errorf("nguoi la nhan %d frame, mong doi 0 - tin di sai phong", got)
	}
}

// TestHubBoQuaKhoaShopRong: nguoi khong so huu shop khong duoc vao phong "shop:".
//
// Khong co luat nay thi MOI buyer nam chung mot phong, va tin gui cho mot shop den tay tat ca.
// Day la ca lo ra tren prod chu khong lo ra khi tu test bang mot tai khoan.
func TestHubBoQuaKhoaShopRong(t *testing.T) {
	hub := NewHub()

	mot := newTestConn()
	hai := newTestConn()
	hub.Join(mot, UserKey("buyer-1"), ShopKey(""))
	hub.Join(hai, UserKey("buyer-2"), ShopKey(""))

	hub.Broadcast(ShopKey(""), nil, serverFrame{Type: frameMessage, Text: "khong duoc toi"})

	if got := len(drain(mot)); got != 0 {
		t.Errorf("buyer 1 nhan %d frame tu phong shop rong, mong doi 0", got)
	}
	if got := len(drain(hai)); got != 0 {
		t.Errorf("buyer 2 nhan %d frame tu phong shop rong, mong doi 0", got)
	}
}

func TestHubBroadcastBoQuaNguoiGui(t *testing.T) {
	hub := NewHub()

	tabMot := newTestConn()
	tabHai := newTestConn()
	hub.Join(tabMot, UserKey("buyer-1"))
	hub.Join(tabHai, UserKey("buyer-1"))

	hub.Broadcast(UserKey("buyer-1"), tabMot, serverFrame{Type: frameMessage, Text: "xin chao"})

	if got := len(drain(tabMot)); got != 0 {
		t.Errorf("tab gui nhan %d frame, mong doi 0 - no da nhan ban co clientMsgId rieng", got)
	}
	if got := len(drain(tabHai)); got != 1 {
		t.Errorf("tab con lai nhan %d frame, mong doi 1", got)
	}
}

func TestHubLeaveDonSachPhong(t *testing.T) {
	hub := NewHub()

	conn := newTestConn()
	hub.Join(conn, UserKey("buyer-1"), ShopKey("shop-1"))
	if hub.Len() != 1 {
		t.Fatalf("sau Join hub giu %d ket noi, mong doi 1", hub.Len())
	}

	hub.Leave(conn)

	if hub.Len() != 0 {
		t.Errorf("sau Leave hub giu %d ket noi, mong doi 0", hub.Len())
	}
	// Phong rong phai bien mat, khong chi rong ruot: mot map phong lon dan mai la ro ri bo nho
	// chay rat cham, khong bao gio lo ra trong mot phien test ngan.
	if len(hub.rooms) != 0 {
		t.Errorf("con %d phong sau khi ket noi cuoi roi di, mong doi 0", len(hub.rooms))
	}
}

// TestHubLeaveHaiLan: goi Leave hai lan khong duoc panic.
//
// Xay ra that: vong doc ket thuc goi Leave qua defer, va duong dong ket noi vi loi ghi cung di
// qua day.
func TestHubLeaveHaiLan(t *testing.T) {
	hub := NewHub()
	conn := newTestConn()
	hub.Join(conn, UserKey("buyer-1"))

	hub.Leave(conn)
	hub.Leave(conn)
}
