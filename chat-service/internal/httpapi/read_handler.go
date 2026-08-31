package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/store"
)

// readRequestLimit 1KB: body cua request nay chi co dung mot uuid. Doc khong gioi han la de mot
// request rac bat service nuot ca megabyte truoc khi kip nhin vao no.
const readRequestLimit = 1 << 10

type readRequest struct {
	ConversationID string `json:"conversationId"`
}

// readHandler danh dau mot hoi thoai la da doc toi thoi diem hien tai.
//
//	POST /chat/read  {"conversationId": "<uuid>"}
//
// POST chu khong phai GET du ten no nghe nhu mot lenh doc: no GHI cot last_read_at, va voi seller
// chua tra loi lan nao thi con TAO row participant cua ho.
//
// Khong nhan moc thoi gian tu client: gui len duoc mot moc tuong lai la xoa sach so chua doc cua
// chinh minh mai mai. Moc luon la gio server luc request toi.
func readHandler(deps ChatDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := bearerToken(r)
		if token == "" {
			// Khach vang lai khong co chat 1-1, nen cung khong co gi de danh dau da doc.
			writeError(w, deps.Logger, http.StatusUnauthorized, errorBody{Reason: "unauthorized"})
			return
		}
		claims, err := deps.Verifier.Verify(token)
		if err != nil {
			writeError(w, deps.Logger, http.StatusUnauthorized, errorBody{Reason: "unauthorized"})
			return
		}

		var body readRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, readRequestLimit)).Decode(&body); err != nil {
			writeError(w, deps.Logger, http.StatusBadRequest, errorBody{Reason: "bad_request"})
			return
		}
		if body.ConversationID == "" {
			writeError(w, deps.Logger, http.StatusBadRequest, errorBody{Reason: "missing_conversation"})
			return
		}

		if deps.Store == nil {
			writeError(w, deps.Logger, http.StatusNotFound, errorBody{Reason: "conversation_not_found"})
			return
		}

		// Hoi shop TRUOC khi phan quyen, giong messagesHandler: seller qua cong bang shop_id chu
		// khong bang participant row. Loi mang o day la "chua biet", khong phai "khong co quyen".
		shopID, err := deps.Shops.ShopIDFor(r.Context(), claims.UserID, token)
		if err != nil {
			deps.Logger.Error("hoi shop cua nguoi goi loi", "err", err)
			writeError(w, deps.Logger, http.StatusServiceUnavailable, errorBody{Reason: "shop_lookup_failed"})
			return
		}

		if err := deps.Store.MarkDirectRead(r.Context(), body.ConversationID, claims.UserID, shopID, time.Now()); err != nil {
			if errors.Is(err, store.ErrConversationNotFound) {
				writeError(w, deps.Logger, http.StatusNotFound, errorBody{Reason: "conversation_not_found"})
				return
			}
			deps.Logger.Error("danh dau da doc loi", "err", err)
			writeError(w, deps.Logger, http.StatusServiceUnavailable, errorBody{Reason: "read_unavailable"})
			return
		}

		// 204 chu khong phai 200 kem body: FE khong doc gi tu day ca. So chua doc moi hien ra tu
		// lan goi /chat/conversations sau, va do la nguon duy nhat cua con so do.
		w.WriteHeader(http.StatusNoContent)
	}
}
