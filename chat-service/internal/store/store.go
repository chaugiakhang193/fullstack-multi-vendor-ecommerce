package store

import (
	"context"
	"fmt"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/store/chatdb"
	"github.com/exaring/otelpgx"
	"github.com/jackc/pgx/v5/pgxpool"
)

// previewRuneLimit la do dai toi da cua last_message_preview tren inbox.
const previewRuneLimit = 120

// Store boc pgxpool + cac query sinh boi sqlc. Chi bao them mot lop mong: hau het thao
// tac goi thang chatdb, chi nhung viec co INVARIANT (nhu AppendMessage) moi co method
// rieng — bao moi ham chi de "co tang repository" la abstraction thua.
type Store struct {
	pool *pgxpool.Pool
	q    *chatdb.Queries
}

// NewStore mo pool toi DB#4 roi Ping ngay de fail-fast neu URL/SSL sai, thay vi chet luc
// nguoi dung gui tin nhan dau tien. ctx la context khoi dong co timeout, khong phai ctx
// vong doi cua service.
func NewStore(ctx context.Context, databaseURL string) (*Store, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database URL loi: %w", err)
	}

	config.ConnConfig.Tracer = otelpgx.NewTracer()

	// Neon free scale-to-zero: compute chi ngu khi khong con ket noi nao. chat-service
	// duoc giu am gan het ngay (cron keep-warm), nen neu pool giu ket noi idle mo suot
	// thi compute Neon khong bao gio ngu va ton han muc compute. MinConns=0 + idle time
	// ngan de pool tu buong khi khong ai chat.
	config.MinConns = 0
	config.MaxConns = 4
	config.MaxConnIdleTime = 60 * time.Second

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("mo pgx pool loi: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping DB loi: %w", err)
	}

	return &Store{pool: pool, q: chatdb.New(pool)}, nil
}

// Queries tra ve tang sqlc de caller goi thang cac query khong co invariant kem theo.
func (s *Store) Queries() *chatdb.Queries {
	return s.q
}

// Pool tra ve pgxpool dang dung, cho code can transaction rieng. Neon free gioi han so
// connection nen tuyet doi khong mo pool thu hai.
func (s *Store) Pool() *pgxpool.Pool {
	return s.pool
}

// Close dong pool khi service shutdown.
func (s *Store) Close() {
	s.pool.Close()
}

// AppendMessageParams gom tham so cua AppendMessage. MessageID do caller sinh (UUIDv7)
// de caller biet id truoc khi ghi, phuc vu luong stream tra id ve truoc noi dung.
type AppendMessageParams struct {
	MessageID           string
	ConversationID      string
	SenderParticipantID string
	Body                string
}

// AppendMessage chen message va cap nhat last_message_* trong cung mot transaction.
// Tach thanh hai lenh roi loi o giua se de inbox hien tin cu hon tin moi nhat cua hoi
// thoai, mot dang lech du lieu am tham.
func (s *Store) AppendMessage(ctx context.Context, arg AppendMessageParams) (chatdb.Message, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return chatdb.Message{}, fmt.Errorf("mo transaction loi: %w", err)
	}
	// Rollback sau Commit la no-op, nen defer nay an toan va bao duoc moi duong thoat som.
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := s.q.WithTx(tx)

	insertParams := chatdb.InsertMessageParams{
		ID:                  arg.MessageID,
		ConversationID:      arg.ConversationID,
		SenderParticipantID: arg.SenderParticipantID,
		Body:                arg.Body,
	}
	msg, err := qtx.InsertMessage(ctx, insertParams)
	if err != nil {
		return chatdb.Message{}, fmt.Errorf("chen message loi: %w", err)
	}

	preview := truncateRunes(arg.Body, previewRuneLimit)
	touchParams := chatdb.TouchConversationParams{
		ID: arg.ConversationID,
		// msg.CreatedAt da la pgtype.Timestamptz (gia tri, khong phai con tro): sqlc
		// chi sinh con tro cho kieu Go co ban (string/int), con kieu pgx nhu
		// Timestamptz/UUID luon la gia tri co san co Valid rieng, gan thang khong qua &.
		LastMessageAt:      msg.CreatedAt,
		LastMessagePreview: &preview,
	}
	if err := qtx.TouchConversation(ctx, touchParams); err != nil {
		return chatdb.Message{}, fmt.Errorf("cap nhat conversation loi: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return chatdb.Message{}, fmt.Errorf("commit loi: %w", err)
	}
	return msg, nil
}

// truncateRunes cat chuoi theo RUNE chu khong theo byte: mot ky tu tieng Viet chiem
// nhieu byte, cat giua chung se de lai ky tu rac tren inbox.
func truncateRunes(s string, limit int) string {
	runes := []rune(s)
	if len(runes) <= limit {
		return s
	}
	return string(runes[:limit])
}
