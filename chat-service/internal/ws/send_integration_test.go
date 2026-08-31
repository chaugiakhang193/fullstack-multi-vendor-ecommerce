package ws

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/auth"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/quota"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/shopclient"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/store"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/google/uuid"
)

// Cung bien moi truong va cung luat host voi test cua package store: test nay ghi that vao DB nen
// chi duoc chay tren Postgres local dung rieng cho test.
const testDatabaseURLEnv = "TEST_DATABASE_URL"

// unreachableMonolith la baseURL cua shopclient trong test.
//
// Khac rong la BAT BUOC: ShopIDFor tra ve som khi baseURL rong, truoc khi hoi cache, nen Seed se
// khong con tac dung nao. Dia chi nay khong bao gio bi goi toi vi moi user deu duoc nap cache
// truoc khi mo ket noi - no chi ton tai de cai cong "hoi cache truoc" duoc mo.
const unreachableMonolith = "http://127.0.0.1:1"

var allowedTestHosts = []string{"localhost", "127.0.0.1"}

func requireLocalTestDB(t *testing.T) string {
	t.Helper()

	databaseURL := os.Getenv(testDatabaseURLEnv)
	if databaseURL == "" {
		t.Skipf("bo qua test integration: chua dat %s", testDatabaseURLEnv)
	}

	parsed, err := url.Parse(databaseURL)
	if err != nil {
		t.Fatalf("%s khong parse duoc: %v", testDatabaseURLEnv, err)
	}
	for _, allowed := range allowedTestHosts {
		if parsed.Hostname() == allowed {
			return databaseURL
		}
	}
	t.Fatalf("TU CHOI CHAY: %s tro toi host %q, ngoai danh sach %v", testDatabaseURLEnv, parsed.Hostname(), allowedTestHosts)
	return ""
}

// realtimeServer gom nhung gi mot test can cham toi sau khi server da dung.
//
// Shops tra ra ngoai chu khong giu trong mot bien goi: hai test chay ke nhau dung chung mot bien
// goi se nhin thay cache cua nhau, va mot test hong se lam test sau hong theo cach rat kho doc.
type realtimeServer struct {
	URL   string
	Store *store.Store
	Shops *shopclient.Client
}

// startRealtimeServer dung server that co /ws, noi vao DB test.
func startRealtimeServer(t *testing.T) realtimeServer {
	t.Helper()

	databaseURL := requireLocalTestDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := store.RunMigrations(databaseURL); err != nil {
		t.Fatalf("chay migration loi: %v", err)
	}
	chatStore, err := store.NewStore(ctx, databaseURL)
	if err != nil {
		t.Fatalf("mo store loi: %v", err)
	}
	t.Cleanup(chatStore.Close)

	verifier, err := auth.NewVerifier(testJWTSecret)
	if err != nil {
		t.Fatalf("NewVerifier loi: %v", err)
	}

	shops := shopclient.New(unreachableMonolith)
	deps := Deps{
		Hub:      NewHub(),
		Store:    chatStore,
		Shops:    shops,
		Verifier: verifier,
		Logger:   slog.Default(),
		Burst:    quota.NewBurst(DefaultBurstCapacity, DefaultBurstRefill),
	}

	mux := http.NewServeMux()
	mux.Handle("GET /ws", Handler(deps, "http://localhost:3000"))
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	return realtimeServer{
		URL:   "ws" + strings.TrimPrefix(server.URL, "http") + "/ws",
		Store: chatStore,
		Shops: shops,
	}
}

// dialAs mo ket noi cho mot nguoi so huu shopID (rong = buyer thuong), gui frame auth, va doc
// frame ready.
//
// Nap cache TRUOC khi mo ket noi, cho ca buyer lan seller: ket noi hoi shop ngay trong buoc auth,
// va do la cho duy nhat no hoi. Nap sau thi tre chuyen.
func dialAs(t *testing.T, rt realtimeServer, userID, shopID string) (*websocket.Conn, context.Context) {
	t.Helper()

	rt.Shops.Seed(userID, shopID)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	t.Cleanup(cancel)

	socket, _, err := websocket.Dial(ctx, rt.URL, nil)
	if err != nil {
		t.Fatalf("mo ket noi loi: %v", err)
	}
	t.Cleanup(func() { _ = socket.CloseNow() })

	if err := wsjson.Write(ctx, socket, clientFrame{Type: frameAuth, Token: signedToken(t, userID)}); err != nil {
		t.Fatalf("gui frame auth loi: %v", err)
	}
	var ready serverFrame
	if err := wsjson.Read(ctx, socket, &ready); err != nil {
		t.Fatalf("doc frame ready loi: %v", err)
	}
	if ready.Type != frameReady {
		t.Fatalf("frame dau tien la %q, mong doi %q", ready.Type, frameReady)
	}
	if ready.ShopID != shopID {
		t.Fatalf("ket noi nhan shopId %q, mong doi %q - duong seller se im lang", ready.ShopID, shopID)
	}
	return socket, ctx
}

// dialAuthed mo ket noi cho mot buyer khong so huu shop nao.
func dialAuthed(t *testing.T, rt realtimeServer, userID string) (*websocket.Conn, context.Context) {
	t.Helper()
	return dialAs(t, rt, userID, "")
}

// TestBuyerGuiTinThiTinNamLaiTrongDB la ca co ban nhat: mo hoi thoai bang shopId, gui mot tin,
// nhan lai echo co id that va clientMsgId cua chinh minh.
func TestBuyerGuiTinThiTinNamLaiTrongDB(t *testing.T) {
	rt := startRealtimeServer(t)

	buyerID := uuid.NewString()
	shopID := uuid.NewString()

	socket, ctx := dialAuthed(t, rt, buyerID)

	send := clientFrame{
		Type:        frameSend,
		ShopID:      shopID,
		Text:        "shop oi con hang khong",
		ClientMsgID: "tam-1",
	}
	if err := wsjson.Write(ctx, socket, send); err != nil {
		t.Fatalf("gui tin loi: %v", err)
	}

	var echo serverFrame
	if err := wsjson.Read(ctx, socket, &echo); err != nil {
		t.Fatalf("doc echo loi: %v", err)
	}
	if echo.Type != frameMessage {
		t.Fatalf("nhan frame %q (reason %q), mong doi %q", echo.Type, echo.Reason, frameMessage)
	}
	if echo.ClientMsgID != "tam-1" {
		t.Errorf("echo tra clientMsgId %q, mong doi %q - FE se ve tin thanh hai dong", echo.ClientMsgID, "tam-1")
	}
	if echo.ID == "" {
		t.Error("echo khong co id that, FE khong noi duoc tin optimistic voi tin da luu")
	}
	if echo.SenderRole != "user" {
		t.Errorf("echo tra senderRole %q, mong doi %q", echo.SenderRole, "user")
	}

	messages, err := rt.Store.DirectMessages(context.Background(), echo.ConversationID, "", 10)
	if err != nil {
		t.Fatalf("doc lai tin loi: %v", err)
	}
	if len(messages) != 1 {
		t.Fatalf("DB giu %d tin, mong doi 1", len(messages))
	}
	if messages[0].Body != send.Text {
		t.Errorf("DB giu %q, mong doi %q", messages[0].Body, send.Text)
	}
}

// TestSellerTraLoiThiBuyerNhanDuoc la ca nghiem thu cua ca ngay: hai ket noi, hai chieu.
func TestSellerTraLoiThiBuyerNhanDuoc(t *testing.T) {
	rt := startRealtimeServer(t)

	buyerID := uuid.NewString()
	sellerID := uuid.NewString()
	shopID := uuid.NewString()

	// Buyer mo hoi thoai truoc: seller khong duoc mo truoc, do la luat cua schema.
	conversation, err := rt.Store.EnsureDirectConversation(context.Background(), buyerID, shopID)
	if err != nil {
		t.Fatalf("mo hoi thoai loi: %v", err)
	}

	buyerSocket, buyerCtx := dialAuthed(t, rt, buyerID)
	sellerSocket, sellerCtx := dialAs(t, rt, sellerID, shopID)

	reply := clientFrame{
		Type:           frameSend,
		ConversationID: conversation.ConversationID,
		Text:           "con hang ban nhe",
		ClientMsgID:    "seller-1",
	}
	if err := wsjson.Write(sellerCtx, sellerSocket, reply); err != nil {
		t.Fatalf("seller gui tin loi: %v", err)
	}

	var received serverFrame
	if err := wsjson.Read(buyerCtx, buyerSocket, &received); err != nil {
		t.Fatalf("buyer khong nhan duoc tin: %v", err)
	}
	if received.Type != frameMessage {
		t.Fatalf("buyer nhan frame %q (reason %q), mong doi %q", received.Type, received.Reason, frameMessage)
	}
	if received.Text != reply.Text {
		t.Errorf("buyer nhan %q, mong doi %q", received.Text, reply.Text)
	}
	if received.SenderRole != "seller" {
		t.Errorf("buyer thay senderRole %q, mong doi %q", received.SenderRole, "seller")
	}
	// Nguoi nhan KHONG duoc thay clientMsgId cua nguoi gui: no se thay the nham mot tin dang cho
	// cua chinh ho neu hai ben tinh co trung chuoi.
	if received.ClientMsgID != "" {
		t.Errorf("buyer nhan clientMsgId %q, mong doi rong", received.ClientMsgID)
	}
}

// TestNguoiLaKhongGuiDuocVaoHoiThoaiCuaNguoiKhac la ca abuse cua ngay 30/08, lam som vi no re.
func TestNguoiLaKhongGuiDuocVaoHoiThoaiCuaNguoiKhac(t *testing.T) {
	rt := startRealtimeServer(t)

	buyerA := uuid.NewString()
	buyerB := uuid.NewString()
	shopID := uuid.NewString()

	conversation, err := rt.Store.EnsureDirectConversation(context.Background(), buyerA, shopID)
	if err != nil {
		t.Fatalf("mo hoi thoai loi: %v", err)
	}

	socket, ctx := dialAuthed(t, rt, buyerB)
	send := clientFrame{
		Type:           frameSend,
		ConversationID: conversation.ConversationID,
		Text:           "toi doc trom duoc khong",
		ClientMsgID:    "xam-1",
	}
	if err := wsjson.Write(ctx, socket, send); err != nil {
		t.Fatalf("gui tin loi: %v", err)
	}

	var frame serverFrame
	if err := wsjson.Read(ctx, socket, &frame); err != nil {
		t.Fatalf("doc phan hoi loi: %v", err)
	}
	if frame.Type != frameError {
		t.Fatalf("nhan frame %q, mong doi %q - nguoi la ghi duoc vao hoi thoai cua nguoi khac", frame.Type, frameError)
	}
	// Cung mot ly do voi "khong ton tai": tach ra la cho phep do id nao co that.
	if frame.Reason != "conversation_not_found" {
		t.Errorf("nhan reason %q, mong doi %q", frame.Reason, "conversation_not_found")
	}

	messages, err := rt.Store.DirectMessages(context.Background(), conversation.ConversationID, "", 10)
	if err != nil {
		t.Fatalf("doc lai tin loi: %v", err)
	}
	if len(messages) != 0 {
		t.Errorf("hoi thoai co %d tin sau lan xam nhap, mong doi 0", len(messages))
	}
}
