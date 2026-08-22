package store

import (
	"sync"
	"testing"
)

// testGuestKey dai 20 ky tu cho khop voi minGuestKeyLen ben httpapi. Tang store khong ep do dai,
// nhung dung khoa that lam du lieu test de khong che mat mot rang buoc that.
const testGuestKey = "guest-abc123def456xy"

// testOwnerUserID phai la UUID: owner_user_id la cot UUID.
const testOwnerUserID = "9f2c1d3e-0000-4000-8000-000000000001"

func TestEnsureBotConversationTaoDuBaThanhPhan(t *testing.T) {
	s, ctx := setupTestDB(t)

	conversation, err := s.EnsureBotConversation(ctx, BotOwner{GuestKey: testGuestKey})
	if err != nil {
		t.Fatalf("EnsureBotConversation loi: %v", err)
	}

	if conversation.ConversationID == "" || conversation.HumanID == "" || conversation.BotID == "" {
		t.Fatalf("thieu id: %+v", conversation)
	}
	if conversation.HumanID == conversation.BotID {
		t.Fatal("participant cua nguoi va cua bot phai la hai dong khac nhau")
	}
}

func TestEnsureBotConversationGoiLaiKhongTaoThem(t *testing.T) {
	s, ctx := setupTestDB(t)
	owner := BotOwner{GuestKey: testGuestKey}

	first, err := s.EnsureBotConversation(ctx, owner)
	if err != nil {
		t.Fatalf("lan 1 loi: %v", err)
	}
	second, err := s.EnsureBotConversation(ctx, owner)
	if err != nil {
		t.Fatalf("lan 2 loi: %v", err)
	}

	if first != second {
		t.Fatalf("goi lai phai tra dung bo id cu:\nlan 1 %+v\nlan 2 %+v", first, second)
	}

	// Doi chieu them o tang DB: goi tuan tu thi nhanh doc-truoc cua ensureParticipant da du,
	// bo no di thi day se la 4.
	var participants int
	row := s.Pool().QueryRow(ctx,
		`SELECT count(*) FROM participant WHERE conversation_id = $1`, first.ConversationID)
	if err := row.Scan(&participants); err != nil {
		t.Fatalf("dem participant loi: %v", err)
	}
	if participants != 2 {
		t.Errorf("co %d participant, mong doi 2 - dang tao trung", participants)
	}
}

// Chu so huu la user o test nay chu khong phai khach: nhanh user la nhanh duy nhat phai doi
// string sang pgtype.UUID, va quen doi thi ghi xuong NULL chu khong bao loi kieu.
func TestEnsureBotConversationChuSoHuuLaUser(t *testing.T) {
	s, ctx := setupTestDB(t)

	conversation, err := s.EnsureBotConversation(ctx, BotOwner{UserID: testOwnerUserID})
	if err != nil {
		t.Fatalf("EnsureBotConversation loi: %v", err)
	}

	var ownerUserID string
	row := s.Pool().QueryRow(ctx,
		`SELECT owner_user_id::text FROM conversation WHERE id = $1`, conversation.ConversationID)
	if err := row.Scan(&ownerUserID); err != nil {
		t.Fatalf("doc owner_user_id loi: %v - dang la NULL thi Scan vao string se hong", err)
	}
	if ownerUserID != testOwnerUserID {
		t.Errorf("owner_user_id = %q, mong doi %q", ownerUserID, testOwnerUserID)
	}
}

func TestEnsureBotConversationTuChoiChuSoHuuMoHo(t *testing.T) {
	s, ctx := setupTestDB(t)

	cases := map[string]BotOwner{
		"khong co ai": {},
		"ca hai":      {UserID: testOwnerUserID, GuestKey: testGuestKey},
		"user id rac": {UserID: "khang"},
	}

	for name, owner := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := s.EnsureBotConversation(ctx, owner); err == nil {
				t.Fatal("chu so huu mo ho PHAI la loi, khong duoc ghi xuong DB")
			}
		})
	}
}

// Chay cho ca hai loai chu so huu: hai nhanh dua vao hai partial index KHAC nhau
// (participant_conversation_user_uniq cho user, participant_conversation_guest_uniq cho khach),
// nen mot nhanh xanh khong noi gi ve nhanh kia.
func TestEnsureBotConversationDuaSongSong(t *testing.T) {
	for name, owner := range map[string]BotOwner{
		"user":  {UserID: testOwnerUserID},
		"khach": {GuestKey: testGuestKey},
	} {
		t.Run(name, func(t *testing.T) {
			ensureBotConversationDuaSongSong(t, owner)
		})
	}
}

func ensureBotConversationDuaSongSong(t *testing.T, owner BotOwner) {
	t.Helper()

	s, ctx := setupTestDB(t)

	const callers = 8
	results := make([]BotConversation, callers)
	errs := make([]error, callers)

	var wg sync.WaitGroup
	wg.Add(callers)
	for i := 0; i < callers; i++ {
		go func(idx int) {
			defer wg.Done()
			results[idx], errs[idx] = s.EnsureBotConversation(ctx, owner)
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			t.Fatalf("caller %d loi: %v", i, err)
		}
	}
	for i, got := range results {
		if got != results[0] {
			t.Fatalf("caller %d ra bo id khac: %+v vs %+v", i, got, results[0])
		}
	}

	// Doi chieu o tang DB: 8 caller dua nhau van phai chi de lai dung 2 participant.
	var participants int
	row := s.Pool().QueryRow(ctx,
		`SELECT count(*) FROM participant WHERE conversation_id = $1`, results[0].ConversationID)
	if err := row.Scan(&participants); err != nil {
		t.Fatalf("dem participant loi: %v", err)
	}
	if participants != 2 {
		t.Errorf("co %d participant, mong doi 2", participants)
	}
}

func TestRecentBotMessagesTraCuTruoc(t *testing.T) {
	s, ctx := setupTestDB(t)

	conversation, err := s.EnsureBotConversation(ctx, BotOwner{GuestKey: testGuestKey})
	if err != nil {
		t.Fatalf("EnsureBotConversation loi: %v", err)
	}

	bodies := []string{"cau hoi 1", "tra loi 1", "cau hoi 2"}
	senders := []string{conversation.HumanID, conversation.BotID, conversation.HumanID}
	for i, body := range bodies {
		params := AppendMessageParams{
			MessageID:           newMessageID(t),
			ConversationID:      conversation.ConversationID,
			SenderParticipantID: senders[i],
			Body:                body,
		}
		if _, err := s.AppendMessage(ctx, params); err != nil {
			t.Fatalf("ghi tin %d loi: %v", i, err)
		}
	}

	messages, err := s.RecentBotMessages(ctx, conversation.ConversationID, 10)
	if err != nil {
		t.Fatalf("RecentBotMessages loi: %v", err)
	}
	if len(messages) != len(bodies) {
		t.Fatalf("co %d tin, mong doi %d", len(messages), len(bodies))
	}
	for i, want := range bodies {
		if messages[i].Body != want {
			t.Errorf("tin %d = %q, mong doi %q - thu tu dang bi nguoc", i, messages[i].Body, want)
		}
	}
}
