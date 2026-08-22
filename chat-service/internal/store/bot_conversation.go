package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/store/chatdb"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// BotConversation la cac id can de ghi mot luot hoi dap: hoi thoai, nguoi hoi, va bot.
type BotConversation struct {
	ConversationID string
	HumanID        string
	BotID          string
}

// BotOwner la chu so huu hoi thoai bot: dung MOT trong hai truong co gia tri.
type BotOwner struct {
	UserID   string
	GuestKey string
}

// botOwnerCols la BotOwner da doi sang dung kieu cot ma sqlc sinh.
//
// owner_user_id va participant.user_id la cot UUID nen sqlc sinh pgtype.UUID, khong phai string.
// Doi mot lan o dau EnsureBotConversation roi truyen xuong: parse lai o ba cho la ba cho co the
// quen, ma quen thi khong bao loi kieu - pgtype.UUID zero value co Valid=false va ghi xuong DB
// thanh NULL, tuc la lang le vi pham conversation_owner_exactly_one.
type botOwnerCols struct {
	userID   pgtype.UUID
	guestKey *string
}

// EnsureBotConversation lay hoi thoai bot cua chu so huu, tao moi neu chua co.
//
// Ca hoi thoai lan participant deu theo mot khuon: SELECT, roi INSERT ... ON CONFLICT DO NOTHING,
// roi SELECT lai neu thua race. Buoc cuoi ton tai vi ON CONFLICT DO NOTHING nuot mat RETURNING,
// nen ben thua nhan pgx.ErrNoRows va phai doc lai dong ben thang vua tao.
//
// Khuon do chi chay dung khi DB co unique index de conflict. Doc-truoc-roi-INSERT o tang app
// KHONG du: hai request cung SELECT thay rong roi cung INSERT, va khong co index thi ca hai deu
// thanh cong. Participant cua bot va cua khach chi duoc phu index tu migration 000003.
func (s *Store) EnsureBotConversation(ctx context.Context, owner BotOwner) (BotConversation, error) {
	if (owner.UserID == "") == (owner.GuestKey == "") {
		return BotConversation{}, errors.New("chu so huu phai la user HOAC khach, khong the ca hai")
	}

	cols, err := botOwnerColumns(owner)
	if err != nil {
		return BotConversation{}, err
	}

	conversation, err := s.findOrCreateBotConversation(ctx, cols)
	if err != nil {
		return BotConversation{}, err
	}

	humanID, err := s.ensureParticipant(ctx, conversation.ID, "user", cols)
	if err != nil {
		return BotConversation{}, err
	}

	// Participant cua bot khong co danh tinh: constraint participant_identity_exactly_one doi
	// role='bot' phai co ca user_id lan guest_key deu NULL. botOwnerCols rong cho ra dung the.
	botID, err := s.ensureParticipant(ctx, conversation.ID, "bot", botOwnerCols{})
	if err != nil {
		return BotConversation{}, err
	}

	return BotConversation{ConversationID: conversation.ID, HumanID: humanID, BotID: botID}, nil
}

// botOwnerColumns doi BotOwner sang kieu cot. Ben goi da dam bao dung mot trong hai truong co
// gia tri.
func botOwnerColumns(owner BotOwner) (botOwnerCols, error) {
	if owner.UserID == "" {
		// Lay dia chi cua BAN SAO chu khong cua truong trong owner: con tro nay di thang vao
		// tham so query va song lau hon loi goi nay.
		guestKey := owner.GuestKey
		return botOwnerCols{guestKey: &guestKey}, nil
	}

	// Ve nguyen tac khong bao gio hong vi auth.Verify da parse sub thanh UUID. Van kiem o day vi
	// store khong duoc tin rang moi ben goi deu di qua tang auth.
	parsed, err := uuid.Parse(owner.UserID)
	if err != nil {
		return botOwnerCols{}, fmt.Errorf("owner user id %q khong phai UUID: %w", owner.UserID, err)
	}
	return botOwnerCols{userID: pgtype.UUID{Bytes: parsed, Valid: true}}, nil
}

// findOrCreateBotConversation tra ve hoi thoai bot cua chu so huu.
func (s *Store) findOrCreateBotConversation(ctx context.Context, cols botOwnerCols) (chatdb.Conversation, error) {
	existing, err := s.getBotConversation(ctx, cols)
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return chatdb.Conversation{}, fmt.Errorf("doc hoi thoai bot loi: %w", err)
	}

	// ShopID de zero value: hoi thoai bot khong thuoc shop nao, va pgtype.UUID zero la NULL -
	// dung cai constraint conversation_shape doi hoi.
	params := chatdb.CreateConversationParams{
		ID:            uuid.NewString(),
		Type:          "bot",
		OwnerUserID:   cols.userID,
		OwnerGuestKey: cols.guestKey,
	}

	created, err := s.q.CreateConversation(ctx, params)
	if err == nil {
		return created, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return chatdb.Conversation{}, fmt.Errorf("tao hoi thoai bot loi: %w", err)
	}

	// ErrNoRows o day nghia la ON CONFLICT DO NOTHING da bo qua: mot request khac vua tao xong
	// giua hai lenh. Doc lai la duong dung, khong phai loi.
	existing, err = s.getBotConversation(ctx, cols)
	if err != nil {
		return chatdb.Conversation{}, fmt.Errorf("doc lai hoi thoai sau race loi: %w", err)
	}
	return existing, nil
}

// getBotConversation goi dung query theo loai chu so huu.
func (s *Store) getBotConversation(ctx context.Context, cols botOwnerCols) (chatdb.Conversation, error) {
	if cols.userID.Valid {
		return s.q.GetBotConversationByUser(ctx, cols.userID)
	}
	return s.q.GetBotConversationByGuest(ctx, cols.guestKey)
}

// ensureParticipant tra ve id participant theo vai tro, tao neu chua co.
func (s *Store) ensureParticipant(ctx context.Context, conversationID, role string, cols botOwnerCols) (string, error) {
	lookup := chatdb.GetParticipantByRoleParams{ConversationID: conversationID, Role: role}
	existing, err := s.q.GetParticipantByRole(ctx, lookup)
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
		UserID:         cols.userID,
		GuestKey:       cols.guestKey,
	}

	created, err := s.q.AddParticipant(ctx, params)
	if err == nil {
		return created.ID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("tao participant %s loi: %w", role, err)
	}

	// Thua race giong nhanh hoi thoai o tren.
	existing, err = s.q.GetParticipantByRole(ctx, lookup)
	if err != nil {
		return "", fmt.Errorf("doc lai participant %s sau race loi: %w", role, err)
	}
	return existing.ID, nil
}

// RecentBotMessages tra ve cac tin nhan gan nhat theo thu tu CU TRUOC de ghep thanh lich su.
//
// Tra ve chatdb.Message chu khong doi sang kieu cua package bot: tang store khong biet gi ve LLM,
// va viec ghep lich su la cua tang tren.
func (s *Store) RecentBotMessages(ctx context.Context, conversationID string, limit int32) ([]chatdb.Message, error) {
	// BeforeID de zero value: pgtype.UUID zero co Valid=false, tuc NULL, tuc trang dau tien.
	// Bo trong o day la co y, khong phai quen.
	params := chatdb.ListMessagesBeforeParams{
		ConversationID: conversationID,
		PageLimit:      limit,
	}
	newestFirst, err := s.q.ListMessagesBefore(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("doc lich su hoi thoai loi: %w", err)
	}

	// Query tra moi-nhat-truoc (phuc vu phan trang keyset); model can cu-truoc nen dao lai.
	oldestFirst := make([]chatdb.Message, 0, len(newestFirst))
	for i := len(newestFirst) - 1; i >= 0; i-- {
		oldestFirst = append(oldestFirst, newestFirst[i])
	}
	return oldestFirst, nil
}
