package ws

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/quota"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/store"
	"github.com/google/uuid"
)

const (
	// maxTextRunes khop CHECK (char_length(body) <= 4000) cua bang message. Lech thi loi hien ra
	// o tang DB, cach xa cho that su quen.
	maxTextRunes = 4000

	// writeDBTimeout: han cho ba lenh DB cua mot tin nhan (phan quyen, tao participant neu can,
	// ghi + cap nhat inbox). Neon co the ngu, nhung 15s ma chua xong thi cho co van de that.
	writeDBTimeout = 15 * time.Second
)

// errOwnShop: seller tu mo hoi thoai voi chinh shop cua minh.
var errOwnShop = errors.New("ws: khong the nhan tin voi shop cua chinh minh")

// errMissingTarget: frame send khong noi duoc no thuoc hoi thoai nao.
var errMissingTarget = errors.New("ws: thieu ca conversationId lan shopId")

// handleSend xu ly mot frame send: kiem, ghi, roi phat cho ca hai dau.
//
// Thu tu cac cua: text -> burst -> store -> phan quyen -> ghi -> phat.
//
// Burst dat TRUOC moi lenh DB va sau moi phep kiem thuan bo nho: mot vong lap gui tin bi chan o
// day khong ghi mot dong nao xuong Neon, va mot frame rac khong ton mot token nao.
func handleSend(ctx context.Context, deps Deps, conn *Conn, frame clientFrame) {
	text := strings.TrimSpace(frame.Text)
	if text == "" || len([]rune(text)) > maxTextRunes {
		conn.sendError("bad_text", frame.ClientMsgID)
		return
	}

	if decision := deps.Burst.Allow(quota.Subject{UserID: conn.UserID}); !decision.Allowed {
		conn.sendError("too_fast", frame.ClientMsgID)
		return
	}

	if deps.Store == nil {
		conn.sendError("store_unavailable", frame.ClientMsgID)
		return
	}

	// r.Context() bi huy ngay khi client rot, nen KHONG dung no cho cac lenh GHI.
	//
	// Cua so dang gia nhat la khi tin da ghi xong mot nua roi nguoi gui dong tab: nguoi nhan da
	// thay tin tren man hinh, ma no khong nam lai trong DB. WithoutCancel giu nguyen gia tri cua
	// context (trace) nhung bo tin hieu huy - dung dieu streamAnswer ben nhanh bot da lam.
	writeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), writeDBTimeout)
	defer cancel()

	target, err := resolveTarget(writeCtx, deps, conn, frame)
	if err != nil {
		if errors.Is(err, store.ErrConversationNotFound) {
			// Cung mot loi cho "khong co" va "khong duoc phep", giong tang HTTP: tach ra thi gui
			// thu 1000 id la do duoc id nao co that.
			conn.sendError("conversation_not_found", frame.ClientMsgID)
			return
		}
		if errors.Is(err, errOwnShop) {
			conn.sendError("own_shop", frame.ClientMsgID)
			return
		}
		if errors.Is(err, errMissingTarget) {
			conn.sendError("missing_target", frame.ClientMsgID)
			return
		}
		deps.Logger.Error("phan quyen gui tin loi", "err", err, "userId", conn.UserID)
		conn.sendError("send_failed", frame.ClientMsgID)
		return
	}

	message, err := deps.Store.AppendMessage(writeCtx, store.AppendMessageParams{
		// UUIDv7 chu khong phai v4: con tro phan trang keyset cua ListMessagesBefore sap theo
		// chinh cot id nay. Mot id v4 chen vao giua se nam sai cho trong thu tu thoi gian.
		MessageID:           uuid.Must(uuid.NewV7()).String(),
		ConversationID:      target.ConversationID,
		SenderParticipantID: target.SenderParticipantID,
		Body:                text,
	})
	if err != nil {
		deps.Logger.Error("ghi tin nhan loi", "err", err, "conversationId", target.ConversationID)
		conn.sendError("send_failed", frame.ClientMsgID)
		return
	}

	fanout(deps, conn, target, message.ID, text, message.CreatedAt.Time, frame.ClientMsgID)
}

// resolveTarget tra ve dinh danh de ghi, tu mot trong hai duong vao.
//
// Hai duong khong doi xung, va do la co y:
//
//   - conversationId rong + shopId co = buyer mo hoi thoai moi. Chi buyer di duong nay duoc, vi
//     schema bat owner_user_id cua hoi thoai direct luon la buyer (luat chong spam tu phia shop).
//   - conversationId co = hoi thoai da ton tai. Ca hai ben deu di duong nay, phan quyen lo phan
//     con lai.
func resolveTarget(
	ctx context.Context,
	deps Deps,
	conn *Conn,
	frame clientFrame,
) (store.DirectTarget, error) {
	if frame.ConversationID != "" {
		return deps.Store.ResolveDirectSend(ctx, frame.ConversationID, conn.UserID, conn.ShopID)
	}

	if frame.ShopID == "" {
		return store.DirectTarget{}, errMissingTarget
	}

	// Chan seller mo hoi thoai voi chinh shop cua ho. Khong chan thi hoi thoai do co
	// owner_user_id = chu shop = nguoi ben kia, va moi luat phan quyen sau nay deu doc no thanh
	// mot buyer - mot hoi thoai khong the tra loi duoc nam mai trong inbox.
	if conn.ShopID != "" && conn.ShopID == frame.ShopID {
		return store.DirectTarget{}, errOwnShop
	}

	conversation, err := deps.Store.EnsureDirectConversation(ctx, conn.UserID, frame.ShopID)
	if err != nil {
		return store.DirectTarget{}, err
	}

	return store.DirectTarget{
		ConversationID:      conversation.ConversationID,
		BuyerUserID:         conn.UserID,
		ShopID:              frame.ShopID,
		SenderParticipantID: conversation.BuyerID,
		SenderRole:          "user",
	}, nil
}

// fanout phat tin vua ghi cho ca hai dau cua hoi thoai.
//
// Ba nhom nguoi nhan, va nguoi gui phai duoc tach ra: cac tab khac cua buyer, cac tab cua seller,
// va chinh tab vua gui. Chi tab vua gui nhan them clientMsgId - do la soi day noi tin optimistic
// no da ve san voi tin that. Cac tab con lai nhan clientMsgId cua nguoi khac thi se thay the nham
// mot tin dang cho cua chinh ho.
func fanout(
	deps Deps,
	sender *Conn,
	target store.DirectTarget,
	messageID, text string,
	createdAt time.Time,
	clientMsgID string,
) {
	// RFC3339 theo UTC, giong messagesHandler: gui gio local cua server la gui gio cua Render,
	// khong phai gio cua nguoi doc.
	message := serverFrame{
		Type:           frameMessage,
		ConversationID: target.ConversationID,
		ID:             messageID,
		SenderID:       target.SenderParticipantID,
		SenderRole:     target.SenderRole,
		Text:           text,
		CreatedAt:      createdAt.UTC().Format(time.RFC3339),
	}

	deps.Hub.Broadcast(UserKey(target.BuyerUserID), sender, message)
	deps.Hub.Broadcast(ShopKey(target.ShopID), sender, message)

	echo := message
	echo.ClientMsgID = clientMsgID
	sender.Send(echo)
}
