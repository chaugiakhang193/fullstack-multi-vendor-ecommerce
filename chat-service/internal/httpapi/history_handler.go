package httpapi

import (
	"net/http"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/store"
)

// historyReadLimit: 30 tin ~ 15 cap hoi-dap, du cho mot phien mua sam va van gon de tra ve mot
// luot.
//
// Han muc dat o SERVER chu khong nhan tu query param: mot tham so limit do client dat la mot cai
// nut de bat service doc ca bang.
const historyReadLimit = 30

type historyMessage struct {
	Role      string `json:"role"`
	Text      string `json:"text"`
	CreatedAt string `json:"createdAt"`
}

type historyResponse struct {
	Messages []historyMessage `json:"messages"`
}

// historyHandler tra ve lich su hoi thoai bot cua chinh nguoi goi.
//
// KHONG qua burst va KHONG tang bo dem quota: day la duong doc thuan (ba SELECT: hoi thoai,
// participant bot, tin nhan), con quota ton tai de bao ve han muc Gemini. Tinh no vao quota
// nghia la mo widget len xem lai cau cu cung tru mat mot luot hoi.
//
// Cung KHONG doc deps.Enabled: kill switch chan duong goi model, khong phai duong doc. Bot nghi
// ma mo widget van thay hoi thoai hom qua moi la dung.
func historyHandler(deps BotDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		subject, guestKey, err := resolveSubject(r, deps.Verifier)
		if err != nil {
			writeError(w, deps.Logger, http.StatusUnauthorized, errorBody{Reason: "unauthorized"})
			return
		}

		// Store nil (test, hoac chay khong co DB) hoac khach khong gui khoa hop le: khong co gi
		// de tra, va do khong phai loi. Tra mang rong de FE khong phai phan biet hai truong hop.
		owner := store.BotOwner{UserID: subject.UserID, GuestKey: guestKey}
		if deps.Store == nil || (owner.UserID == "" && owner.GuestKey == "") {
			writeJSON(w, deps.Logger, http.StatusOK, historyResponse{Messages: []historyMessage{}})
			return
		}

		messages, err := deps.Store.FindBotHistory(r.Context(), owner, historyReadLimit)
		if err != nil {
			deps.Logger.Error("doc lich su bot loi", "err", err)
			writeError(w, deps.Logger, http.StatusServiceUnavailable, errorBody{Reason: "history_unavailable"})
			return
		}

		// Khoi tao mang rong chu khong de nil: encoding/json ghi nil slice thanh null, va FE se
		// phai kiem them mot truong hop chi vi kieu du lieu ben Go.
		body := historyResponse{Messages: make([]historyMessage, 0, len(messages))}
		for _, message := range messages {
			body.Messages = append(body.Messages, historyMessage{
				Role: message.Role,
				Text: message.Text,
				// RFC3339 theo UTC: FE tu doi sang gio may nguoi dung. Gui gio local cua server
				// la gui gio cua Render, khong phai gio cua nguoi doc.
				CreatedAt: message.CreatedAt.UTC().Format(time.RFC3339),
			})
		}
		writeJSON(w, deps.Logger, http.StatusOK, body)
	}
}
