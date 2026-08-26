package ws

import "sync"

// Hub giu cac ket noi dang mo, xep theo KHOA PHAT chu khong theo nguoi.
//
// Hai loai khoa, vi hai dau cua mot hoi thoai duoc dinh danh khac nhau:
//
//   - "user:<userId>" - buyer, va cung la cac tab khac cua chinh nguoi gui
//   - "shop:<shopId>" - seller
//
// Vi sao seller khong xep theo user_id: luc buyer mo hoi thoai, chat-service biet shop_id nhung
// KHONG biet ai la chu shop - DB#4 khong co bang shop, va hoi monolith moi lan phat tin la mot
// vong mang nam giua hai nguoi dang nhan tin. Xep theo shop_id thi phat tin khong can biet dieu do.
//
// Mot nguoi mo nhieu tab = nhieu Conn trong cung mot phong. Do la ly do gia tri cua map la mot
// tap chu khong phai mot con tro.
type Hub struct {
	mu    sync.RWMutex
	rooms map[string]map[*Conn]struct{}

	// keys nho mot ket noi da vao nhung phong nao, de Leave khong phai quet toan bo rooms.
	// No cung la cho duy nhat dem duoc so ket noi dang mo.
	keys map[*Conn][]string
}

// NewHub dung mot hub rong.
func NewHub() *Hub {
	return &Hub{
		rooms: make(map[string]map[*Conn]struct{}),
		keys:  make(map[*Conn][]string),
	}
}

// UserKey la khoa phong cua mot tai khoan.
func UserKey(userID string) string { return "user:" + userID }

// ShopKey la khoa phong cua mot shop.
func ShopKey(shopID string) string { return "shop:" + shopID }

// Join dua mot ket noi vao cac phong. Khoa rong bi bo qua - nguoi khong so huu shop nao goi
// Join(c, UserKey(id), ShopKey("")) va khong duoc phep roi vao phong "shop:".
func (h *Hub) Join(c *Conn, keys ...string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for _, key := range keys {
		// "shop:" rong nghia la khong so huu shop. De lot vao thi MOI nguoi khong co shop deu
		// nam chung mot phong, va tin cua mot shop se den tay tat ca bon ho.
		if key == "" || key == ShopKey("") {
			continue
		}
		room, ok := h.rooms[key]
		if !ok {
			room = make(map[*Conn]struct{})
			h.rooms[key] = room
		}
		room[c] = struct{}{}
		h.keys[c] = append(h.keys[c], key)
	}
}

// Leave go ket noi khoi moi phong no da vao. Goi duoc nhieu lan.
func (h *Hub) Leave(c *Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for _, key := range h.keys[c] {
		room, ok := h.rooms[key]
		if !ok {
			continue
		}
		delete(room, c)
		// Xoa phong rong: khong xoa thi map phinh vinh vien theo so shop tung online mot lan.
		if len(room) == 0 {
			delete(h.rooms, key)
		}
	}
	delete(h.keys, c)
}

// Broadcast phat mot frame toi moi ket noi trong phong, tru skip.
//
// skip la ket noi cua chinh nguoi gui: ho nhan mot ban rieng co kem clientMsgId, gui ca hai ban
// thi tin hien hai lan.
func (h *Hub) Broadcast(key string, skip *Conn, frame serverFrame) {
	h.mu.RLock()
	targets := make([]*Conn, 0, len(h.rooms[key]))
	for conn := range h.rooms[key] {
		if conn == skip {
			continue
		}
		targets = append(targets, conn)
	}
	h.mu.RUnlock()

	// Gui NGOAI vung khoa: Send co the dong mot ket noi cham, va duong dong do cham vao chinh
	// hub. Giu khoa qua day la tu dat mot vong khoa long nhau khong ai nhin thay.
	for _, conn := range targets {
		conn.Send(frame)
	}
}

// Len tra ve so ket noi dang mo. Dung cho gauge Prometheus va cho test.
func (h *Hub) Len() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.keys)
}
