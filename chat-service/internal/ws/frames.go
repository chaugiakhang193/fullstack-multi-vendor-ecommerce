// Package ws giu duong realtime cua chat 1-1: mot hub trong bo nho, mot ket noi WebSocket cho
// moi tab dang mo, va duong ghi tin nhan.
//
// Ranh gioi voi package httpapi: httpapi phuc vu cac lenh DOC (inbox, lich su, cau hoi bot), ws
// phuc vu duong GHI cua chat 1-1 va viec phat tin. Hai ben dung chung tang store va tang auth,
// khong dung chung handler nao.
package ws

// Ten cac loai frame. Hang chu khong phai chuoi go thang vao code: chung duoc SO SANH o vong doc
// va duoc GHI o cho phat tin, nen mot lan go nham se lam FE im lang ma khong ai bao gi.
const (
	frameAuth    = "auth"
	frameReady   = "ready"
	frameSend    = "send"
	frameMessage = "message"
	frameError   = "error"
)

// clientFrame la khuon chung cua moi frame client gui len.
//
// MOT struct cho ca hai loai frame thay vi hai struct + hai lan giai ma: frame chat 1-1 chi co
// vai truong, va doc hai lan nghia la phai giu ban JSON tho lai giua hai lan do.
type clientFrame struct {
	Type string `json:"type"`

	// Token chi co nghia o frame auth.
	Token string `json:"token,omitempty"`

	// Bon truong duoi day thuoc frame send.
	//
	// ConversationID rong + ShopID co gia tri = buyer mo hoi thoai moi. Ca hai deu co =
	// ConversationID thang, ShopID bi bo qua: client khong duoc quyen noi mot hoi thoai thuoc
	// ve shop nao.
	ConversationID string `json:"conversationId,omitempty"`
	ShopID         string `json:"shopId,omitempty"`
	Text           string `json:"text,omitempty"`

	// ClientMsgID do client sinh de noi lai tin optimistic voi tin that khi server echo ve.
	// Server khong bao gio doc no nhu mot dinh danh - chi tra lai nguyen van.
	ClientMsgID string `json:"clientMsgId,omitempty"`
}

// serverFrame la khuon chung cua moi frame server gui xuong.
//
// Tin nhan gui cho NGUOI GUI va cho NGUOI NHAN dung chung mot khuon, chi khac o ClientMsgID.
// Nho vay FE chi viet mot nhanh render cho ca tin minh gui lan tin minh nhan.
type serverFrame struct {
	Type string `json:"type"`

	// Hai truong cua frame ready. ShopID rong = nguoi nay khong so huu shop nao, tuc chi chat
	// duoc voi tu cach buyer.
	UserID string `json:"userId,omitempty"`
	ShopID string `json:"shopId,omitempty"`

	// Cac truong cua frame message.
	ConversationID string `json:"conversationId,omitempty"`
	ID             string `json:"id,omitempty"`
	SenderID       string `json:"senderId,omitempty"`
	SenderRole     string `json:"senderRole,omitempty"`
	Text           string `json:"text,omitempty"`
	CreatedAt      string `json:"createdAt,omitempty"`
	ClientMsgID    string `json:"clientMsgId,omitempty"`

	// Reason cua frame error, dung chung bang ma voi tang HTTP. Frame error dung chung ca
	// ClientMsgID o tren: server tra lai dung gia tri client da gui trong frame bi tu choi, de
	// FE biet tin dang cho nao trong danh sach optimistic vua bi loi.
	Reason string `json:"reason,omitempty"`
}
