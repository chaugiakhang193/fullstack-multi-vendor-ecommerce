package httpapi

import (
	"errors"
	"net/http"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/store"
)

// messagesReadLimit: 30 tin mot trang, dat o server. Giong inboxReadLimit ve ly do.
const messagesReadLimit = 30

type directMessageItem struct {
	ID        string `json:"id"`
	SenderID  string `json:"senderId"`
	Text      string `json:"text"`
	CreatedAt string `json:"createdAt"`
}

type messagesResponse struct {
	Messages []directMessageItem `json:"messages"`
	// NextBefore la con tro cho trang sau. Rong = het tin. FE gui lai nguyen van o ?before=.
	NextBefore string `json:"nextBefore,omitempty"`
}

// messagesHandler tra ve mot trang tin nhan cua mot hoi thoai 1-1.
//
//	GET /chat/messages?conversationId=<uuid>&before=<uuid>
//
// Moi request deu di qua AuthorizeDirectRead TRUOC khi doc tin: conversationId tu client khong
// bao gio duoc coi la hop le. Khong tim thay va khong duoc phep tra CUNG mot loi 404, de khong ai
// do duoc conversationId nao co that.
func messagesHandler(deps ChatDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := bearerToken(r)
		if token == "" {
			writeError(w, deps.Logger, http.StatusUnauthorized, errorBody{Reason: "unauthorized"})
			return
		}
		claims, err := deps.Verifier.Verify(token)
		if err != nil {
			writeError(w, deps.Logger, http.StatusUnauthorized, errorBody{Reason: "unauthorized"})
			return
		}

		conversationID := r.URL.Query().Get("conversationId")
		if conversationID == "" {
			writeError(w, deps.Logger, http.StatusBadRequest, errorBody{Reason: "missing_conversation"})
			return
		}

		if deps.Store == nil {
			writeError(w, deps.Logger, http.StatusNotFound, errorBody{Reason: "conversation_not_found"})
			return
		}

		// Hoi shop cua nguoi goi TRUOC khi phan quyen: seller doc bang shop_id chu khong bang
		// participant row. Loi mang o day khong duoc bien thanh 404 - do la "chua biet", khong
		// phai "khong co quyen".
		shopID, err := deps.Shops.ShopIDFor(r.Context(), claims.UserID, token)
		if err != nil {
			deps.Logger.Error("hoi shop cua nguoi goi loi", "err", err)
			writeError(w, deps.Logger, http.StatusServiceUnavailable, errorBody{Reason: "shop_lookup_failed"})
			return
		}

		if _, err := deps.Store.AuthorizeDirectRead(r.Context(), conversationID, claims.UserID, shopID); err != nil {
			if errors.Is(err, store.ErrConversationNotFound) {
				writeError(w, deps.Logger, http.StatusNotFound, errorBody{Reason: "conversation_not_found"})
				return
			}
			deps.Logger.Error("phan quyen doc hoi thoai loi", "err", err)
			writeError(w, deps.Logger, http.StatusServiceUnavailable, errorBody{Reason: "messages_unavailable"})
			return
		}

		before := r.URL.Query().Get("before")
		messages, err := deps.Store.DirectMessages(r.Context(), conversationID, before, messagesReadLimit)
		if err != nil {
			deps.Logger.Error("doc tin nhan loi", "err", err)
			writeError(w, deps.Logger, http.StatusServiceUnavailable, errorBody{Reason: "messages_unavailable"})
			return
		}

		body := messagesResponse{Messages: make([]directMessageItem, 0, len(messages))}
		for _, message := range messages {
			body.Messages = append(body.Messages, directMessageItem{
				ID:       message.ID,
				SenderID: message.SenderParticipantID,
				Text:     message.Body,
				// RFC3339 theo UTC: FE tu doi sang gio may nguoi dung. Gui gio local cua server
				// la gui gio cua Render, khong phai gio cua nguoi doc.
				CreatedAt: message.CreatedAt.UTC().Format(time.RFC3339),
			})
		}

		// Tra du mot trang day = con co the con nua. Dat con tro o tin CUOI (cu nhat) vi query
		// tra moi-nhat-truoc va phan trang di nguoc ve qua khu.
		if len(messages) == messagesReadLimit {
			body.NextBefore = messages[len(messages)-1].ID
		}

		writeJSON(w, deps.Logger, http.StatusOK, body)
	}
}
