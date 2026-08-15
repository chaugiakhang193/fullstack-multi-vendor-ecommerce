package store

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/store/chatdb"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// Bien moi truong chi toi Postgres DUNG RIENG cho test. Khong dat thi test integration
// bi skip, de `go test ./...` van chay duoc tren may khong co Postgres.
const testDatabaseURLEnv = "TEST_DATABASE_URL"

// allowedTestHosts la danh sach host duy nhat duoc phep chay test integration. Test nay
// XOA DU LIEU giua cac case nen phai chan tu goc: URL tro toi bat ky host nao khac
// localhost deu lam test that bai ngay, khong chay mot cau lenh nao.
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

	hostname := parsed.Hostname()
	isAllowed := false
	for _, allowed := range allowedTestHosts {
		if hostname == allowed {
			isAllowed = true
			break
		}
	}
	if !isAllowed {
		t.Fatalf(
			"TU CHOI CHAY: %s tro toi host %q, khong nam trong danh sach cho phep %v. "+
				"Test nay xoa du lieu nen chi duoc chay tren Postgres local dung rieng cho test.",
			testDatabaseURLEnv, hostname, allowedTestHosts,
		)
	}

	return databaseURL
}

// setupTestDB chay migration roi don sach bang truoc moi test. TRUNCATE ... CASCADE du
// cho ca 3 bang hoi thoai vi message/participant deu tro ve conversation.
func setupTestDB(t *testing.T) (*Store, context.Context) {
	t.Helper()

	databaseURL := requireLocalTestDB(t)

	if err := RunMigrations(databaseURL); err != nil {
		t.Fatalf("chay migration loi: %v", err)
	}

	bgCtx := context.Background()
	timeout := 30 * time.Second
	ctx, cancel := context.WithTimeout(bgCtx, timeout)
	t.Cleanup(cancel)

	s, err := NewStore(ctx, databaseURL)
	if err != nil {
		t.Fatalf("mo store loi: %v", err)
	}
	t.Cleanup(s.Close)

	truncate := `TRUNCATE conversation, bot_usage_daily CASCADE`
	if _, err := s.Pool().Exec(ctx, truncate); err != nil {
		t.Fatalf("don DB loi: %v", err)
	}

	return s, ctx
}

// newMessageID sinh UUIDv7 de id cua message sap theo thoi gian.
func newMessageID(t *testing.T) string {
	t.Helper()
	id, err := uuid.NewV7()
	if err != nil {
		t.Fatalf("sinh UUIDv7 loi: %v", err)
	}
	return id.String()
}

// mustUUID doi chuoi UUID hop le (tu uuid.NewString()/uuid.NewV7()) sang pgtype.UUID de
// truyen vao cot uuid nullable (sqlc sinh pgtype.UUID cho cot nullable, khong phai
// *string, vi override uuid->string trong sqlc.yaml chi ap dung cho cot NOT NULL). Panic
// thay vi t.Fatalf vi ham nay con duoc goi tu goroutine con — t.Fatalf chi an toan tren
// goroutine chinh cua test. Input luon la UUID vua sinh nen loi parse o day nghia la co
// bug, khong phai mot ket qua test hop le.
func mustUUID(s string) pgtype.UUID {
	var u pgtype.UUID
	if err := u.Scan(s); err != nil {
		panic(fmt.Sprintf("parse uuid %q loi: %v", s, err))
	}
	return u
}

// mustDate boc mot time.Time thanh pgtype.Date cho cot usage_date.
func mustDate(tm time.Time) pgtype.Date {
	return pgtype.Date{Time: tm, Valid: true}
}

// TestCreateDirectConversationIsIdempotentUnderRace mo phong hai tab cung bam "Chat voi
// shop": 10 goroutine cung tao hoi thoai cho cung cap (buyer, shop). Ky vong: DB chi giu
// dung MOT hoi thoai, va moi goroutine deu lay ve dung id do.
func TestCreateDirectConversationIsIdempotentUnderRace(t *testing.T) {
	s, ctx := setupTestDB(t)

	buyerID := uuid.NewString()
	shopID := uuid.NewString()

	const racers = 10
	ids := make([]string, racers)
	var wg sync.WaitGroup

	for i := 0; i < racers; i++ {
		wg.Add(1)
		go func(slot int) {
			defer wg.Done()

			conversationID := uuid.NewString()
			createParams := chatdb.CreateConversationParams{
				ID:          conversationID,
				Type:        "direct",
				OwnerUserID: mustUUID(buyerID),
				ShopID:      mustUUID(shopID),
			}

			created, err := s.Queries().CreateConversation(ctx, createParams)
			if err == nil {
				ids[slot] = created.ID
				return
			}

			// 0 row tra ve nghia la ban khac da thang: SELECT bu de lay hoi thoai cua ho.
			getParams := chatdb.GetDirectConversationParams{
				OwnerUserID: mustUUID(buyerID),
				ShopID:      mustUUID(shopID),
			}
			existing, getErr := s.Queries().GetDirectConversation(ctx, getParams)
			if getErr != nil {
				t.Errorf("goroutine %d: khong tao duoc va cung khong doc duoc: %v / %v", slot, err, getErr)
				return
			}
			ids[slot] = existing.ID
		}(i)
	}
	wg.Wait()

	var total int64
	countQuery := `SELECT count(*) FROM conversation WHERE type = 'direct'`
	if err := s.Pool().QueryRow(ctx, countQuery).Scan(&total); err != nil {
		t.Fatalf("dem conversation loi: %v", err)
	}
	if total != 1 {
		t.Fatalf("mong doi dung 1 hoi thoai direct, thuc te %d", total)
	}

	for slot, id := range ids {
		if id == "" {
			t.Fatalf("goroutine %d khong nhan duoc id nao", slot)
		}
		if id != ids[0] {
			t.Fatalf("goroutine %d nhan id %q, khac voi %q — hai tab da lac sang hai hoi thoai", slot, id, ids[0])
		}
	}
}

// TestAppendMessageIsAtomic kiem message va last_message_* di cung nhau.
func TestAppendMessageIsAtomic(t *testing.T) {
	s, ctx := setupTestDB(t)

	conversationID, participantID := seedBotConversation(t, s, ctx)

	body := "Cho minh hoi dien thoai duoi 5 trieu co nhung mau nao"
	appendParams := AppendMessageParams{
		MessageID:           newMessageID(t),
		ConversationID:      conversationID,
		SenderParticipantID: participantID,
		Body:                body,
	}
	msg, err := s.AppendMessage(ctx, appendParams)
	if err != nil {
		t.Fatalf("AppendMessage loi: %v", err)
	}

	var preview *string
	var lastAt *time.Time
	readBack := `SELECT last_message_preview, last_message_at FROM conversation WHERE id = $1`
	if err := s.Pool().QueryRow(ctx, readBack, conversationID).Scan(&preview, &lastAt); err != nil {
		t.Fatalf("doc lai conversation loi: %v", err)
	}

	if preview == nil || *preview != body {
		t.Fatalf("preview khong khop: %v", preview)
	}
	if lastAt == nil || !lastAt.Equal(msg.CreatedAt.Time) {
		t.Fatalf("last_message_at khong khop thoi diem message: %v vs %v", lastAt, msg.CreatedAt)
	}
}

// TestIncrementBotUsageUnderConcurrency: 20 request song song phai dem ra dung 20. Day
// la lop phong thu chong dot quota Gemini — dem thieu mot luot la thung quota mot luot.
func TestIncrementBotUsageUnderConcurrency(t *testing.T) {
	s, ctx := setupTestDB(t)

	subjectKey := "ip:14.169.17.140"
	usageDate := mustDate(time.Now())

	const callers = 20
	var wg sync.WaitGroup
	for i := 0; i < callers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			incrementParams := chatdb.IncrementBotUsageParams{
				SubjectKey: subjectKey,
				UsageDate:  usageDate,
			}
			if _, err := s.Queries().IncrementBotUsage(ctx, incrementParams); err != nil {
				t.Errorf("IncrementBotUsage loi: %v", err)
			}
		}()
	}
	wg.Wait()

	getParams := chatdb.GetBotUsageParams{
		SubjectKey: subjectKey,
		UsageDate:  usageDate,
	}
	final, err := s.Queries().GetBotUsage(ctx, getParams)
	if err != nil {
		t.Fatalf("doc lai so luot loi: %v", err)
	}
	if final != callers {
		t.Fatalf("mong doi %d luot, thuc te %d — co luot bi mat, quota se bi thung", callers, final)
	}
}

// TestListMessagesBeforeKeyset kiem con tro keyset mot cot chay dung tren UUIDv7.
func TestListMessagesBeforeKeyset(t *testing.T) {
	s, ctx := setupTestDB(t)

	conversationID, participantID := seedBotConversation(t, s, ctx)

	const total = 5
	for i := 0; i < total; i++ {
		appendParams := AppendMessageParams{
			MessageID:           newMessageID(t),
			ConversationID:      conversationID,
			SenderParticipantID: participantID,
			Body:                "tin nhan thu " + string(rune('A'+i)),
		}
		if _, err := s.AppendMessage(ctx, appendParams); err != nil {
			t.Fatalf("AppendMessage loi: %v", err)
		}
		// Ngu 1ms de dam bao phan mili-giay cua UUIDv7 khac nhau giua cac tin.
		time.Sleep(time.Millisecond)
	}

	firstPageParams := chatdb.ListMessagesBeforeParams{
		ConversationID: conversationID,
		PageLimit:      2,
	}
	firstPage, err := s.Queries().ListMessagesBefore(ctx, firstPageParams)
	if err != nil {
		t.Fatalf("trang dau loi: %v", err)
	}
	if len(firstPage) != 2 {
		t.Fatalf("trang dau mong doi 2 tin, thuc te %d", len(firstPage))
	}

	cursor := firstPage[len(firstPage)-1].ID
	secondPageParams := chatdb.ListMessagesBeforeParams{
		ConversationID: conversationID,
		BeforeID:       mustUUID(cursor),
		PageLimit:      2,
	}
	secondPage, err := s.Queries().ListMessagesBefore(ctx, secondPageParams)
	if err != nil {
		t.Fatalf("trang hai loi: %v", err)
	}
	if len(secondPage) != 2 {
		t.Fatalf("trang hai mong doi 2 tin, thuc te %d", len(secondPage))
	}
	for _, m := range secondPage {
		if m.ID >= cursor {
			t.Fatalf("trang hai lot tin %q khong nho hon con tro %q", m.ID, cursor)
		}
	}
}

// seedBotConversation tao mot hoi thoai bot cua mot user kem participant cua user do.
func seedBotConversation(t *testing.T, s *Store, ctx context.Context) (conversationID string, participantID string) {
	t.Helper()

	userID := uuid.NewString()
	conversationID = uuid.NewString()

	createParams := chatdb.CreateConversationParams{
		ID:          conversationID,
		Type:        "bot",
		OwnerUserID: mustUUID(userID),
	}
	if _, err := s.Queries().CreateConversation(ctx, createParams); err != nil {
		t.Fatalf("tao hoi thoai bot loi: %v", err)
	}

	participantID = uuid.NewString()
	addParams := chatdb.AddParticipantParams{
		ID:             participantID,
		ConversationID: conversationID,
		Role:           "user",
		UserID:         mustUUID(userID),
	}
	if _, err := s.Queries().AddParticipant(ctx, addParams); err != nil {
		t.Fatalf("them participant loi: %v", err)
	}
	return conversationID, participantID
}
