package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/store/chatdb"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// DirectConversation la cac id can de ghi mot tin nhan cua buyer: hoi thoai va participant
// cua chinh nguoi gui.
//
// KHONG co SellerID: luc buyer mo hoi thoai, chat-service biet shop_id nhung khong biet
// user_id cua seller (khong co bang shop o DB#4). Participant cua seller duoc tao muon, o
// duong GHI, khi seller that su gui tin dau tien.
type DirectConversation struct {
	ConversationID string
	BuyerID        string
}

// InboxItem la mot dong trong danh sach hoi thoai.
type InboxItem struct {
	ConversationID string
	ShopID         string
	BuyerUserID    string
	Preview        string
	LastMessageAt  time.Time
	// Unread dem tin CUA NGUOI KIA sau lan doc cuoi cua nguoi xem. Chua tung doc = dem tat ca.
	Unread int64
}

// DirectMessage la mot tin nhan da bo cac cot tang duoi khong can biet.
type DirectMessage struct {
	ID                  string
	SenderParticipantID string
	Body                string
	CreatedAt           time.Time
}

// ErrConversationNotFound: hoi thoai khong ton tai, HOAC nguoi goi khong co quyen doc no.
//
// MOT loi cho ca hai truong hop la co y. Tach ra thanh "khong thay" va "khong duoc phep" cho
// phep mot nguoi do xem conversationId nao co that: gui thu 1000 id, cai nao tra 403 thay vi
// 404 la cai co that.
var ErrConversationNotFound = errors.New("store: khong tim thay hoi thoai")

// EnsureDirectConversation lay hoi thoai giua buyer va shop, tao moi neu chua co.
//
// Chi buyer goi duoc ham nay. Seller khong mo hoi thoai truoc duoc - do la luat chong spam tu
// phia shop, va no da duoc cam o schema: conversation.owner_user_id luon la buyer.
//
// Theo dung khuon cua EnsureBotConversation: SELECT, INSERT ON CONFLICT DO NOTHING, SELECT lai
// neu thua race. Xem comment o findOrCreateBotConversation de biet vi sao buoc ba la bat buoc.
func (s *Store) EnsureDirectConversation(ctx context.Context, buyerUserID, shopID string) (DirectConversation, error) {
	buyerCol, err := parseUUIDColumn(buyerUserID, "buyer user id")
	if err != nil {
		return DirectConversation{}, err
	}
	shopCol, err := parseUUIDColumn(shopID, "shop id")
	if err != nil {
		return DirectConversation{}, err
	}

	conversation, err := s.findOrCreateDirectConversation(ctx, buyerCol, shopCol)
	if err != nil {
		return DirectConversation{}, err
	}

	buyerID, err := s.ensureUserParticipant(ctx, conversation.ID, "user", buyerCol)
	if err != nil {
		return DirectConversation{}, err
	}

	return DirectConversation{ConversationID: conversation.ID, BuyerID: buyerID}, nil
}

// findOrCreateDirectConversation tra ve hoi thoai direct cua cap (buyer, shop).
func (s *Store) findOrCreateDirectConversation(
	ctx context.Context,
	buyerCol, shopCol pgtype.UUID,
) (chatdb.Conversation, error) {
	lookup := chatdb.GetDirectConversationParams{OwnerUserID: buyerCol, ShopID: shopCol}

	existing, err := s.q.GetDirectConversation(ctx, lookup)
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return chatdb.Conversation{}, fmt.Errorf("doc hoi thoai direct loi: %w", err)
	}

	// OwnerGuestKey de nil: hoi thoai direct khong bao gio thuoc ve khach vang lai, va
	// conversation_owner_exactly_one doi dung mot trong hai chu so huu.
	params := chatdb.CreateConversationParams{
		ID:          uuid.NewString(),
		Type:        "direct",
		OwnerUserID: buyerCol,
		ShopID:      shopCol,
	}

	created, err := s.q.CreateConversation(ctx, params)
	if err == nil {
		return created, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return chatdb.Conversation{}, fmt.Errorf("tao hoi thoai direct loi: %w", err)
	}

	// ErrNoRows = ON CONFLICT DO NOTHING da bo qua vi mot request khac vua tao xong giua hai
	// lenh. Doc lai la duong dung, khong phai loi.
	existing, err = s.q.GetDirectConversation(ctx, lookup)
	if err != nil {
		return chatdb.Conversation{}, fmt.Errorf("doc lai hoi thoai direct sau race loi: %w", err)
	}
	return existing, nil
}

// ensureUserParticipant tra ve id participant cua mot nguoi that trong hoi thoai, tao neu chua co.
//
// Khac ensureParticipant cua nhanh bot o cho tra cuu: ben do tim theo ROLE (moi hoi thoai bot co
// dung mot participant 'bot'), ben nay tim theo USER_ID. Hoi thoai direct co hai participant deu
// la nguoi that, nen role khong con phan biet duoc ai voi ai.
func (s *Store) ensureUserParticipant(
	ctx context.Context,
	conversationID, role string,
	userCol pgtype.UUID,
) (string, error) {
	lookup := chatdb.GetParticipantByUserParams{ConversationID: conversationID, UserID: userCol}

	existing, err := s.q.GetParticipantByUser(ctx, lookup)
	if err == nil {
		return existing.ID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("doc participant %s loi: %w", role, err)
	}

	params := chatdb.AddParticipantParams{
		ID:             uuid.NewString(),
		ConversationID: conversationID,
		Role:           role,
		UserID:         userCol,
	}

	created, err := s.q.AddParticipant(ctx, params)
	if err == nil {
		return created.ID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("tao participant %s loi: %w", role, err)
	}

	existing, err = s.q.GetParticipantByUser(ctx, lookup)
	if err != nil {
		return "", fmt.Errorf("doc lai participant %s sau race loi: %w", role, err)
	}
	return existing.ID, nil
}

// AuthorizeDirectRead kiem nguoi goi co duoc doc hoi thoai nay khong, roi tra ve hoi thoai.
//
// conversationId tu client khong bao gio duoc coi la hop le cho toi khi ham nay xac nhan. Moi
// endpoint doc tin nhan phai di qua ham nay truoc khi cham vao du lieu that.
//
// Hai duong duoc phep, va chung khong doi xung:
//   - buyer: co mot row participant khop user_id cua minh
//   - seller: conversation.shop_id khop shop ma minh so huu (viewerShopID)
//
// Seller KHONG can participant row de doc. Doi row do ton tai nghia la mot lenh GET phai tao du
// lieu, dung dieu ma FindBotHistory da co y tranh.
//
// viewerShopID rong = nguoi goi khong so huu shop nao, chi con duong buyer.
func (s *Store) AuthorizeDirectRead(
	ctx context.Context,
	conversationID, viewerUserID, viewerShopID string,
) (chatdb.Conversation, error) {
	conversation, err := s.q.GetConversationByID(ctx, conversationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return chatdb.Conversation{}, ErrConversationNotFound
		}
		return chatdb.Conversation{}, fmt.Errorf("doc hoi thoai loi: %w", err)
	}

	// Hoi thoai bot khong di qua duong nay: no co endpoint rieng (/chat/history) voi luat chu
	// so huu rieng, gom ca khach vang lai.
	if conversation.Type != "direct" {
		return chatdb.Conversation{}, ErrConversationNotFound
	}

	if viewerShopID != "" && uuidText(conversation.ShopID) == viewerShopID {
		return conversation, nil
	}

	userCol, err := parseUUIDColumn(viewerUserID, "viewer user id")
	if err != nil {
		return chatdb.Conversation{}, ErrConversationNotFound
	}
	lookup := chatdb.GetParticipantByUserParams{ConversationID: conversationID, UserID: userCol}
	if _, err := s.q.GetParticipantByUser(ctx, lookup); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return chatdb.Conversation{}, ErrConversationNotFound
		}
		return chatdb.Conversation{}, fmt.Errorf("doc participant loi: %w", err)
	}
	return conversation, nil
}

// ListInboxForUser tra ve hoi thoai cua mot buyer, moi nhat truoc.
//
// Gom CA hoi thoai bot lan direct vi query loc theo owner_user_id. Caller loc tiep neu chi muon
// mot loai: day la tang store, khong quyet dinh giup tang tren.
func (s *Store) ListInboxForUser(ctx context.Context, userID string, limit int32) ([]InboxItem, error) {
	userCol, err := parseUUIDColumn(userID, "user id")
	if err != nil {
		return nil, err
	}

	params := chatdb.ListConversationsForUserParams{OwnerUserID: userCol, PageLimit: limit}
	rows, err := s.q.ListConversationsForUser(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("doc inbox buyer loi: %w", err)
	}

	items := make([]InboxItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, toInboxItem(row.Conversation, row.Unread))
	}
	return items, nil
}

// ListInboxForShop tra ve hoi thoai direct cua mot shop, moi nhat truoc.
//
// viewerUserID la nguoi DANG XEM, khong phai chu hoi thoai: danh sach hoi thoai truy theo shop,
// nhung so chua doc truy theo participant cua chinh nguoi mo inbox. Hai id nay khac nhau va deu
// bat buoc - truyen nham thi danh sach van dung con so chua doc thi sai am tham.
func (s *Store) ListInboxForShop(
	ctx context.Context,
	shopID, viewerUserID string,
	limit int32,
) ([]InboxItem, error) {
	shopCol, err := parseUUIDColumn(shopID, "shop id")
	if err != nil {
		return nil, err
	}
	viewerCol, err := parseUUIDColumn(viewerUserID, "viewer user id")
	if err != nil {
		return nil, err
	}

	params := chatdb.ListConversationsForShopParams{
		ShopID:       shopCol,
		ViewerUserID: viewerCol,
		PageLimit:    limit,
	}
	rows, err := s.q.ListConversationsForShop(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("doc inbox shop loi: %w", err)
	}

	items := make([]InboxItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, toInboxItem(row.Conversation, row.Unread))
	}
	return items, nil
}

// DirectMessages tra ve mot trang tin nhan, MOI NHAT TRUOC.
//
// Khac RecentBotMessages o cho khong dao nguoc: nhanh bot dao vi model can doc cu-truoc, con
// FE chat cuon nguoc len nen nhan moi-truoc dung hon. beforeID rong = trang dau tien.
func (s *Store) DirectMessages(
	ctx context.Context,
	conversationID, beforeID string,
	limit int32,
) ([]DirectMessage, error) {
	params := chatdb.ListMessagesBeforeParams{
		ConversationID: conversationID,
		PageLimit:      limit,
	}
	// BeforeID de zero value khi beforeID rong: pgtype.UUID zero co Valid=false, tuc NULL, tuc
	// trang dau tien. Con tro rac thi coi nhu trang dau chu khong tra loi - mot cursor hong chi
	// nen lam mat cho dang doc, khong nen lam hong ca man hinh.
	if beforeID != "" {
		if parsed, err := parseUUIDColumn(beforeID, "before id"); err == nil {
			params.BeforeID = parsed
		}
	}

	rows, err := s.q.ListMessagesBefore(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("doc tin nhan loi: %w", err)
	}

	messages := make([]DirectMessage, 0, len(rows))
	for _, row := range rows {
		messages = append(messages, DirectMessage{
			ID:                  row.ID,
			SenderParticipantID: row.SenderParticipantID,
			Body:                row.Body,
			CreatedAt:           row.CreatedAt.Time,
		})
	}
	return messages, nil
}

// toInboxItem doi mot dong DB sang kieu cua tang tren, phang cac cot nullable.
func toInboxItem(row chatdb.Conversation, unread int64) InboxItem {
	item := InboxItem{
		ConversationID: row.ID,
		ShopID:         uuidText(row.ShopID),
		BuyerUserID:    uuidText(row.OwnerUserID),
		LastMessageAt:  row.LastMessageAt.Time,
		Unread:         unread,
	}
	if row.LastMessagePreview != nil {
		item.Preview = *row.LastMessagePreview
	}
	return item
}

// parseUUIDColumn doi chuoi sang kieu cot ma sqlc doi.
//
// Ton tai vi de pgtype.UUID zero value di xuong DB la loi im lang: Valid=false ghi thanh NULL,
// va NULL o owner_user_id hoac shop_id vi pham conversation_shape - loi hien ra o tang DB, cach
// xa cho that su quen.
func parseUUIDColumn(value, label string) (pgtype.UUID, error) {
	parsed, err := uuid.Parse(value)
	if err != nil {
		return pgtype.UUID{}, fmt.Errorf("%s %q khong phai UUID: %w", label, value, err)
	}
	return pgtype.UUID{Bytes: parsed, Valid: true}, nil
}

// uuidText doi cot UUID sang chuoi, tra chuoi rong neu cot la NULL.
func uuidText(value pgtype.UUID) string {
	if !value.Valid {
		return ""
	}
	return uuid.UUID(value.Bytes).String()
}

// DirectTarget la moi thu duong GHI can biet ve mot hoi thoai: no o dau, hai dau la ai, va
// participant nao dung ten nguoi gui.
//
// Vi sao khong tra thang chatdb.Conversation nhu AuthorizeDirectRead: kieu do mang pgtype.UUID,
// va de package ws tu doi sang chuoi nghia la logic "cot NULL thi la chuoi rong" bi sao chep
// sang mot package khong co viec gi voi tang DB.
type DirectTarget struct {
	ConversationID      string
	BuyerUserID         string
	ShopID              string
	SenderParticipantID string
	// SenderRole la 'user' hoac 'seller' - dung bang chu ma cot participant.role cho phep.
	SenderRole string
}

// ResolveDirectSend phan quyen mot nguoi gui vao mot hoi thoai da co, roi tra ve dinh danh de ghi.
//
// Dung lai AuthorizeDirectRead lam cong duy nhat: quyen GHI vao mot hoi thoai 1-1 khong rong hon
// quyen DOC no. Tach thanh hai bo luat la mo duong cho chung lech nhau ma khong ai phat hien.
//
// Vai duoc suy tu chinh hoi thoai chu khong tu tham so: ai khong phai chu so huu ma qua duoc cong
// tren thi chi con duong seller (khop shop_id), va suy nhu vay thi mot ngay them vai moi khong
// lam hong cho nay.
func (s *Store) ResolveDirectSend(
	ctx context.Context,
	conversationID, senderUserID, senderShopID string,
) (DirectTarget, error) {
	conversation, err := s.AuthorizeDirectRead(ctx, conversationID, senderUserID, senderShopID)
	if err != nil {
		return DirectTarget{}, err
	}

	buyerUserID := uuidText(conversation.OwnerUserID)
	role := "seller"
	if buyerUserID == senderUserID {
		role = "user"
	}

	senderCol, err := parseUUIDColumn(senderUserID, "sender user id")
	if err != nil {
		return DirectTarget{}, err
	}

	// Participant cua seller duoc tao O DAY - lan dau ho tra loi, khong phai luc buyer mo hoi
	// thoai (luc do chua biet ai la chu shop) va cung khong phai luc ho doc (mot lenh GET khong
	// duoc tao du lieu - dung ly do FindBotHistory da co y tranh).
	participantID, err := s.ensureUserParticipant(ctx, conversationID, role, senderCol)
	if err != nil {
		return DirectTarget{}, err
	}

	return DirectTarget{
		ConversationID:      conversation.ID,
		BuyerUserID:         buyerUserID,
		ShopID:              uuidText(conversation.ShopID),
		SenderParticipantID: participantID,
		SenderRole:          role,
	}, nil
}

// MarkDirectRead ghi moc "da doc toi day" cho nguoi dang mo hoi thoai.
//
// Dung lai ResolveDirectSend lam cong: danh dau da doc can dung mot phep phan quyen va dung mot
// row participant voi duong ghi. Hai duong tu tim participant rieng la mo cho chung lech nhau.
//
// Ham nay TAO row participant cho seller neu ho chua tra loi lan nao - va do la ly do no chi duoc
// goi tu mot request GHI. Mot lenh GET khong duoc de lai du lieu (xem FindBotHistory).
//
// readAt do caller truyen chu khong lay now() o day: test can dat moc thoi gian, va gio cua mot
// lan doc la thong tin cua tang tren chu khong phai cua tang DB.
func (s *Store) MarkDirectRead(
	ctx context.Context,
	conversationID, viewerUserID, viewerShopID string,
	readAt time.Time,
) error {
	target, err := s.ResolveDirectSend(ctx, conversationID, viewerUserID, viewerShopID)
	if err != nil {
		return err
	}

	params := chatdb.MarkReadParams{
		ID:         target.SenderParticipantID,
		LastReadAt: pgtype.Timestamptz{Time: readAt, Valid: true},
	}
	if err := s.q.MarkRead(ctx, params); err != nil {
		return fmt.Errorf("ghi moc da doc loi: %w", err)
	}
	return nil
}
