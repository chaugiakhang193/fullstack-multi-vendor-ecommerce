package httpapi

import (
	"net/http"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/store"
)

// inboxReadLimit dat o SERVER, khong nhan tu query param. Cung ly do voi historyReadLimit: mot
// tham so limit do client dat la mot cai nut de bat service doc ca bang.
const inboxReadLimit = 30

type conversationItem struct {
	ConversationID string `json:"conversationId"`
	ShopID         string `json:"shopId"`
	BuyerUserID    string `json:"buyerUserId"`
	Preview        string `json:"preview"`
	LastMessageAt  string `json:"lastMessageAt,omitempty"`
	// Unread khong co omitempty: mot hoi thoai da doc het phai gui ve 0, khong phai bien mat.
	// Thieu truong thi FE giu lai con so cu cua lan ve truoc.
	Unread int64 `json:"unread"`
}

type conversationsResponse struct {
	Conversations []conversationItem `json:"conversations"`
}

// conversationsHandler tra ve inbox cua nguoi goi.
//
//	GET /chat/conversations            -> hoi thoai ma minh la buyer
//	GET /chat/conversations?as=seller  -> hoi thoai gui toi shop cua minh
//
// Vi sao co param thay vi tu suy: tang auth co y KHONG doc role tu token (xem internal/auth/jwt.go),
// nen muon biet nguoi goi la seller thi phai hoi monolith. Khong co param thi moi request cua
// buyer cung ton mot lan goi sang monolith chi de biet ho khong phai seller.
//
// Param nay KHONG phai cong tac phan quyen: gui ?as=seller ma khong so huu shop nao thi nhan
// mang rong, khong phai nhan hoi thoai cua nguoi khac.
func conversationsHandler(deps ChatDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := bearerToken(r)
		if token == "" {
			// Khach vang lai khong co chat 1-1: schema bat hoi thoai direct phai co owner_user_id.
			writeError(w, deps.Logger, http.StatusUnauthorized, errorBody{Reason: "unauthorized"})
			return
		}
		claims, err := deps.Verifier.Verify(token)
		if err != nil {
			writeError(w, deps.Logger, http.StatusUnauthorized, errorBody{Reason: "unauthorized"})
			return
		}

		if deps.Store == nil {
			writeJSON(w, deps.Logger, http.StatusOK, conversationsResponse{
				Conversations: []conversationItem{},
			})
			return
		}

		if r.URL.Query().Get("as") == "seller" {
			shopID, err := deps.Shops.ShopIDFor(r.Context(), claims.UserID, token)
			if err != nil {
				deps.Logger.Error("hoi shop cua seller loi", "err", err)
				writeError(w, deps.Logger, http.StatusServiceUnavailable, errorBody{Reason: "shop_lookup_failed"})
				return
			}
			// Khong so huu shop nao: tra mang rong chu khong 403. Day khong phai hanh vi bi cam,
			// chi la khong co gi de xem.
			if shopID == "" {
				writeJSON(w, deps.Logger, http.StatusOK, conversationsResponse{
					Conversations: []conversationItem{},
				})
				return
			}

			rows, err := deps.Store.ListInboxForShop(r.Context(), shopID, claims.UserID, inboxReadLimit)
			if err != nil {
				deps.Logger.Error("doc inbox shop loi", "err", err)
				writeError(w, deps.Logger, http.StatusServiceUnavailable, errorBody{Reason: "inbox_unavailable"})
				return
			}
			writeJSON(w, deps.Logger, http.StatusOK, toConversationsResponse(rows))
			return
		}

		rows, err := deps.Store.ListInboxForUser(r.Context(), claims.UserID, inboxReadLimit)
		if err != nil {
			deps.Logger.Error("doc inbox buyer loi", "err", err)
			writeError(w, deps.Logger, http.StatusServiceUnavailable, errorBody{Reason: "inbox_unavailable"})
			return
		}
		writeJSON(w, deps.Logger, http.StatusOK, toConversationsResponse(rows))
	}
}

// toConversationsResponse doi ket qua store sang body JSON.
func toConversationsResponse(rows []store.InboxItem) conversationsResponse {
	// Khoi tao mang rong chu khong de nil: encoding/json ghi nil slice thanh null, va FE se phai
	// kiem them mot truong hop chi vi kieu du lieu ben Go.
	body := conversationsResponse{Conversations: make([]conversationItem, 0, len(rows))}
	for _, row := range rows {
		item := conversationItem{
			ConversationID: row.ConversationID,
			ShopID:         row.ShopID,
			BuyerUserID:    row.BuyerUserID,
			Preview:        row.Preview,
			Unread:         row.Unread,
		}
		// LastMessageAt zero = hoi thoai chua co tin nao. Bo trong truong nay thay vi gui
		// "0001-01-01T00:00:00Z", thu ma FE se phai biet cach nhan ra.
		if !row.LastMessageAt.IsZero() {
			item.LastMessageAt = row.LastMessageAt.UTC().Format(time.RFC3339)
		}
		body.Conversations = append(body.Conversations, item)
	}
	return body
}
