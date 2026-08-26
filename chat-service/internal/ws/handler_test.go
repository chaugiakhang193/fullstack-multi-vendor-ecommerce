package ws

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/auth"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/quota"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/shopclient"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/golang-jwt/jwt/v5"
)

const testJWTSecret = "secret-dung-chung-voi-monolith"

// testUserID phai la UUID that: auth.Verify tu choi sub khong parse duoc.
const testUserID = "9f2c1d3e-0000-4000-8000-000000000001"

func signedToken(t *testing.T, subject string) string {
	t.Helper()

	claims := jwt.MapClaims{"sub": subject, "exp": time.Now().Add(time.Hour).Unix()}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testJWTSecret))
	if err != nil {
		t.Fatalf("ky token loi: %v", err)
	}
	return signed
}

// startTestServer dung mot server that co /ws, tra ve dia chi ws:// va hub dang dung.
//
// Store de nil: bon test o file nay dung o buoc bat tay va xac thuc, khong cham DB. Duong ghi co
// test rieng trong send_integration_test.go.
func startTestServer(t *testing.T) (string, *Hub) {
	t.Helper()

	verifier, err := auth.NewVerifier(testJWTSecret)
	if err != nil {
		t.Fatalf("NewVerifier loi: %v", err)
	}

	hub := NewHub()
	deps := Deps{
		Hub:      hub,
		Shops:    shopclient.New(""),
		Verifier: verifier,
		Logger:   slog.Default(),
		Burst:    quota.NewBurst(DefaultBurstCapacity, DefaultBurstRefill),
	}

	mux := http.NewServeMux()
	mux.Handle("GET /ws", Handler(deps, "http://localhost:3000"))

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	return "ws" + strings.TrimPrefix(server.URL, "http") + "/ws", hub
}

// dialTest mo ket noi toi server test. Khong gui Origin: dung nhu curl/wscat.
func dialTest(t *testing.T, url string) (*websocket.Conn, context.Context) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	t.Cleanup(cancel)

	socket, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("mo ket noi loi: %v", err)
	}
	t.Cleanup(func() { _ = socket.CloseNow() })

	return socket, ctx
}

func TestTokenDungThiNhanReady(t *testing.T) {
	url, hub := startTestServer(t)
	socket, ctx := dialTest(t, url)

	if err := wsjson.Write(ctx, socket, clientFrame{Type: frameAuth, Token: signedToken(t, testUserID)}); err != nil {
		t.Fatalf("gui frame auth loi: %v", err)
	}

	var frame serverFrame
	if err := wsjson.Read(ctx, socket, &frame); err != nil {
		t.Fatalf("doc frame ready loi: %v", err)
	}
	if frame.Type != frameReady {
		t.Errorf("frame dau tien la %q, mong doi %q", frame.Type, frameReady)
	}
	if frame.UserID != testUserID {
		t.Errorf("ready tra userId %q, mong doi %q", frame.UserID, testUserID)
	}
	// MonolithURL rong nen ShopIDFor luon tra chuoi rong: nguoi nay chi chat duoc voi tu cach buyer.
	if frame.ShopID != "" {
		t.Errorf("ready tra shopId %q, mong doi rong", frame.ShopID)
	}
	if hub.Len() != 1 {
		t.Errorf("hub giu %d ket noi, mong doi 1", hub.Len())
	}
}

func TestTokenSaiThiDong4401(t *testing.T) {
	url, _ := startTestServer(t)
	socket, ctx := dialTest(t, url)

	if err := wsjson.Write(ctx, socket, clientFrame{Type: frameAuth, Token: "khong-phai-jwt"}); err != nil {
		t.Fatalf("gui frame auth loi: %v", err)
	}

	var frame serverFrame
	err := wsjson.Read(ctx, socket, &frame)
	if err == nil {
		t.Fatalf("doc duoc frame %+v, mong doi ket noi bi dong", frame)
	}
	assertCloseStatus(t, err, closeUnauthorized)
}

// TestFrameDauTienKhongPhaiAuthThiDong: gui thang mot frame send truoc khi xac thuc.
//
// Ca nay quan trong hon no trong: khong co no thi mot ket noi vo danh van di duoc vao vong doc,
// va moi cua kiem sau do deu dua tren mot UserID rong.
func TestFrameDauTienKhongPhaiAuthThiDong(t *testing.T) {
	url, _ := startTestServer(t)
	socket, ctx := dialTest(t, url)

	send := clientFrame{Type: frameSend, ConversationID: "bat-ky", Text: "chao"}
	if err := wsjson.Write(ctx, socket, send); err != nil {
		t.Fatalf("gui frame send loi: %v", err)
	}

	var frame serverFrame
	if err := wsjson.Read(ctx, socket, &frame); err == nil {
		t.Fatalf("doc duoc frame %+v, mong doi ket noi bi dong", frame)
	} else {
		assertCloseStatus(t, err, closeUnauthorized)
	}
}

// TestImLangQuaHanThiDong doi het authDeadline ma khong gui gi.
func TestImLangQuaHanThiDong(t *testing.T) {
	url, _ := startTestServer(t)
	socket, ctx := dialTest(t, url)

	var frame serverFrame
	err := wsjson.Read(ctx, socket, &frame)
	if err == nil {
		t.Fatalf("doc duoc frame %+v, mong doi ket noi bi dong vi qua han auth", frame)
	}
	assertCloseStatus(t, err, closeUnauthorized)
}

// TestGocLaBiTuChoi: header Origin khong khop FRONTEND_URL thi khong bat tay duoc.
func TestGocLaBiTuChoi(t *testing.T) {
	url, _ := startTestServer(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	options := &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": []string{"https://ke-gian.example.com"}},
	}
	socket, _, err := websocket.Dial(ctx, url, options)
	if err == nil {
		_ = socket.CloseNow()
		t.Fatal("goc la van bat tay duoc, mong doi bi tu choi")
	}
}

// assertCloseStatus doi ma dong that ra khoi loi cua thu vien.
func assertCloseStatus(t *testing.T, err error, want websocket.StatusCode) {
	t.Helper()

	var closeErr websocket.CloseError
	if !errors.As(err, &closeErr) {
		t.Fatalf("loi %v khong phai CloseError, khong doc duoc ma dong", err)
	}
	if closeErr.Code != want {
		t.Errorf("dong bang ma %d, mong doi %d", closeErr.Code, want)
	}
}
