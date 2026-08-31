package store

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

// TestDirectConversationIdempotent: mo hoi thoai hai lan phai ra dung mot hoi thoai.
//
// Day la ca thuong gap nhat chu khong phai ca hiem: nguoi dung bam "Chat voi shop" o trang san
// pham roi bam lai o trang shop.
func TestDirectConversationIdempotent(t *testing.T) {
	s, ctx := setupTestDB(t)

	buyerID := uuid.NewString()
	shopID := uuid.NewString()

	first, err := s.EnsureDirectConversation(ctx, buyerID, shopID)
	if err != nil {
		t.Fatalf("lan mo dau loi: %v", err)
	}
	second, err := s.EnsureDirectConversation(ctx, buyerID, shopID)
	if err != nil {
		t.Fatalf("lan mo hai loi: %v", err)
	}

	if first.ConversationID != second.ConversationID {
		t.Errorf("hai lan mo ra hai hoi thoai: %q va %q", first.ConversationID, second.ConversationID)
	}
	if first.BuyerID != second.BuyerID {
		t.Errorf("hai lan mo ra hai participant: %q va %q", first.BuyerID, second.BuyerID)
	}
}

// TestDirectConversationConcurrent: hai tab bam cung luc van ra mot hoi thoai.
//
// Ca nay moi la ly do dung ON CONFLICT DO NOTHING thay vi doc-roi-INSERT o tang app. Khong co
// test nay thi race chi lo ra tren prod, duoi dang mot nguoi co hai hoi thoai voi cung mot shop
// va tin nhan chia doi giua chung.
func TestDirectConversationConcurrent(t *testing.T) {
	s, ctx := setupTestDB(t)

	buyerID := uuid.NewString()
	shopID := uuid.NewString()

	const racers = 8
	results := make(chan string, racers)
	errs := make(chan error, racers)

	for i := 0; i < racers; i++ {
		go func() {
			conversation, err := s.EnsureDirectConversation(ctx, buyerID, shopID)
			if err != nil {
				errs <- err
				return
			}
			results <- conversation.ConversationID
		}()
	}

	seen := make(map[string]struct{})
	for i := 0; i < racers; i++ {
		select {
		case err := <-errs:
			t.Fatalf("mo hoi thoai dong thoi loi: %v", err)
		case id := <-results:
			seen[id] = struct{}{}
		}
	}

	if len(seen) != 1 {
		t.Errorf("mong doi dung 1 hoi thoai, nhan %d", len(seen))
	}
}

// TestDirectReadRejectsOutsider: buyer B doan (hoac nhat duoc) conversationId cua buyer A thi
// khong duoc doc - day la abuse case chinh cua AuthorizeDirectRead.
func TestDirectReadRejectsOutsider(t *testing.T) {
	s, ctx := setupTestDB(t)

	buyerA := uuid.NewString()
	buyerB := uuid.NewString()
	shopID := uuid.NewString()

	conversation, err := s.EnsureDirectConversation(ctx, buyerA, shopID)
	if err != nil {
		t.Fatalf("mo hoi thoai cua A loi: %v", err)
	}

	if _, err := s.AuthorizeDirectRead(ctx, conversation.ConversationID, buyerA, ""); err != nil {
		t.Fatalf("chinh chu A phai doc duoc: %v", err)
	}
	if _, err := s.AuthorizeDirectRead(ctx, conversation.ConversationID, buyerB, ""); err == nil {
		t.Fatal("buyer B doc duoc hoi thoai cua buyer A - LO BAO MAT")
	}
}

// TestDirectReadAllowsShopOwner: seller doc duoc bang shop_id, khong can participant row.
func TestDirectReadAllowsShopOwner(t *testing.T) {
	s, ctx := setupTestDB(t)

	buyerID := uuid.NewString()
	shopID := uuid.NewString()
	otherShopID := uuid.NewString()

	conversation, err := s.EnsureDirectConversation(ctx, buyerID, shopID)
	if err != nil {
		t.Fatalf("mo hoi thoai loi: %v", err)
	}

	sellerUserID := uuid.NewString()
	if _, err := s.AuthorizeDirectRead(ctx, conversation.ConversationID, sellerUserID, shopID); err != nil {
		t.Fatalf("chu shop phai doc duoc: %v", err)
	}
	if _, err := s.AuthorizeDirectRead(ctx, conversation.ConversationID, sellerUserID, otherShopID); err == nil {
		t.Fatal("shop khac doc duoc hoi thoai - LO BAO MAT")
	}
}

// TestDirectInboxForShop: hoi thoai cua shop nay khong lot sang shop khac.
func TestDirectInboxForShop(t *testing.T) {
	s, ctx := setupTestDB(t)

	shopID := uuid.NewString()
	otherShopID := uuid.NewString()

	if _, err := s.EnsureDirectConversation(ctx, uuid.NewString(), shopID); err != nil {
		t.Fatalf("mo hoi thoai loi: %v", err)
	}
	if _, err := s.EnsureDirectConversation(ctx, uuid.NewString(), otherShopID); err != nil {
		t.Fatalf("mo hoi thoai shop khac loi: %v", err)
	}

	items, err := s.ListInboxForShop(ctx, shopID, uuid.NewString(), 30)
	if err != nil {
		t.Fatalf("doc inbox shop loi: %v", err)
	}
	for _, item := range items {
		if item.ShopID != shopID {
			t.Errorf("inbox shop %q lot hoi thoai cua shop %q", shopID, item.ShopID)
		}
	}
}

// sendAs ghi mot tin cua mot participant vao hoi thoai.
func sendAs(t *testing.T, ctx context.Context, s *Store, conversationID, participantID, body string) {
	t.Helper()

	_, err := s.AppendMessage(ctx, AppendMessageParams{
		MessageID:           uuid.Must(uuid.NewV7()).String(),
		ConversationID:      conversationID,
		SenderParticipantID: participantID,
		Body:                body,
	})
	if err != nil {
		t.Fatalf("ghi tin loi: %v", err)
	}
}

// findInboxItem lay dong cua mot hoi thoai trong mot inbox.
func findInboxItem(t *testing.T, items []InboxItem, conversationID string) InboxItem {
	t.Helper()

	for _, item := range items {
		if item.ConversationID == conversationID {
			return item
		}
	}
	t.Fatalf("inbox khong co hoi thoai %q", conversationID)
	return InboxItem{}
}

// TestUnreadDemTinCuaNguoiKia: tin cua chinh minh khong lam inbox cua minh sang len.
//
// Day la ca de sai nhat cua ca query: dem tat ca tin sau last_read_at thi nguoi vua gui xong mot
// tin se thay chinh no la "chua doc".
func TestUnreadDemTinCuaNguoiKia(t *testing.T) {
	s, ctx := setupTestDB(t)

	buyerID := uuid.NewString()
	sellerID := uuid.NewString()
	shopID := uuid.NewString()

	conversation, err := s.EnsureDirectConversation(ctx, buyerID, shopID)
	if err != nil {
		t.Fatalf("mo hoi thoai loi: %v", err)
	}

	// Seller tra loi mot cau: buoc nay tao luon participant cua ho.
	seller, err := s.ResolveDirectSend(ctx, conversation.ConversationID, sellerID, shopID)
	if err != nil {
		t.Fatalf("phan quyen seller loi: %v", err)
	}

	sendAs(t, ctx, s, conversation.ConversationID, conversation.BuyerID, "shop oi con hang khong")
	sendAs(t, ctx, s, conversation.ConversationID, seller.SenderParticipantID, "con hang ban nhe")
	sendAs(t, ctx, s, conversation.ConversationID, seller.SenderParticipantID, "ban dat luon nhe")

	buyerInbox, err := s.ListInboxForUser(ctx, buyerID, 30)
	if err != nil {
		t.Fatalf("doc inbox buyer loi: %v", err)
	}
	if unread := findInboxItem(t, buyerInbox, conversation.ConversationID).Unread; unread != 2 {
		t.Errorf("buyer thay %d tin chua doc, mong doi 2 (tin cua chinh ho khong duoc tinh)", unread)
	}

	sellerInbox, err := s.ListInboxForShop(ctx, shopID, sellerID, 30)
	if err != nil {
		t.Fatalf("doc inbox seller loi: %v", err)
	}
	if unread := findInboxItem(t, sellerInbox, conversation.ConversationID).Unread; unread != 1 {
		t.Errorf("seller thay %d tin chua doc, mong doi 1", unread)
	}
}

// TestUnreadVeKhongSauKhiDanhDauDaDoc: MarkDirectRead phai xoa het so chua doc.
func TestUnreadVeKhongSauKhiDanhDauDaDoc(t *testing.T) {
	s, ctx := setupTestDB(t)

	buyerID := uuid.NewString()
	sellerID := uuid.NewString()
	shopID := uuid.NewString()

	conversation, err := s.EnsureDirectConversation(ctx, buyerID, shopID)
	if err != nil {
		t.Fatalf("mo hoi thoai loi: %v", err)
	}
	seller, err := s.ResolveDirectSend(ctx, conversation.ConversationID, sellerID, shopID)
	if err != nil {
		t.Fatalf("phan quyen seller loi: %v", err)
	}
	sendAs(t, ctx, s, conversation.ConversationID, seller.SenderParticipantID, "con hang ban nhe")

	// Moc doc lay tu created_at cua chinh tin vua gui, khong phai time.Now() cua tien trinh test:
	// created_at do DB dat, va hai dong ho lech nhau vai mili giay la du de test chop tat. Lay
	// moc tu DB thi ca hai ve cua phep so deu do cung mot dong ho dem.
	//
	// Cung khong dat moc o tuong lai: no se nuot luon nhung tin den sau do, dung cai bay ma
	// readHandler tranh bang cach khong nhan moc thoi gian tu client.
	stored, err := s.DirectMessages(ctx, conversation.ConversationID, "", 10)
	if err != nil {
		t.Fatalf("doc lai tin loi: %v", err)
	}
	if err := s.MarkDirectRead(ctx, conversation.ConversationID, buyerID, "", stored[0].CreatedAt); err != nil {
		t.Fatalf("danh dau da doc loi: %v", err)
	}

	buyerInbox, err := s.ListInboxForUser(ctx, buyerID, 30)
	if err != nil {
		t.Fatalf("doc inbox buyer loi: %v", err)
	}
	if unread := findInboxItem(t, buyerInbox, conversation.ConversationID).Unread; unread != 0 {
		t.Errorf("sau khi danh dau da doc van con %d tin chua doc", unread)
	}

	// Tin moi ve sau moc do van phai dem lai tu dau.
	sendAs(t, ctx, s, conversation.ConversationID, seller.SenderParticipantID, "ban con hoi gi khong")
	buyerInbox, err = s.ListInboxForUser(ctx, buyerID, 30)
	if err != nil {
		t.Fatalf("doc lai inbox buyer loi: %v", err)
	}
	if unread := findInboxItem(t, buyerInbox, conversation.ConversationID).Unread; unread != 1 {
		t.Errorf("tin den sau lan doc dem duoc %d, mong doi 1", unread)
	}
}

// TestUnreadCuaSellerChuaTraLoiLanNao: khong co row participant thi moi tin deu la chua doc.
//
// Day la ca ma mot cau JOIN thuong bo mat: seller chua tra loi lan nao thi khong co participant,
// va mot INNER JOIN se lam ca hoi thoai bien mat khoi inbox cua ho.
func TestUnreadCuaSellerChuaTraLoiLanNao(t *testing.T) {
	s, ctx := setupTestDB(t)

	buyerID := uuid.NewString()
	sellerID := uuid.NewString()
	shopID := uuid.NewString()

	conversation, err := s.EnsureDirectConversation(ctx, buyerID, shopID)
	if err != nil {
		t.Fatalf("mo hoi thoai loi: %v", err)
	}
	sendAs(t, ctx, s, conversation.ConversationID, conversation.BuyerID, "shop oi")
	sendAs(t, ctx, s, conversation.ConversationID, conversation.BuyerID, "co ai khong")

	sellerInbox, err := s.ListInboxForShop(ctx, shopID, sellerID, 30)
	if err != nil {
		t.Fatalf("doc inbox seller loi: %v", err)
	}
	if unread := findInboxItem(t, sellerInbox, conversation.ConversationID).Unread; unread != 2 {
		t.Errorf("seller chua tra loi thay %d tin chua doc, mong doi 2", unread)
	}
}
