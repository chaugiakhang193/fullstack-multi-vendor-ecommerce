package store

import (
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

	items, err := s.ListInboxForShop(ctx, shopID, 30)
	if err != nil {
		t.Fatalf("doc inbox shop loi: %v", err)
	}
	for _, item := range items {
		if item.ShopID != shopID {
			t.Errorf("inbox shop %q lot hoi thoai cua shop %q", shopID, item.ShopID)
		}
	}
}
