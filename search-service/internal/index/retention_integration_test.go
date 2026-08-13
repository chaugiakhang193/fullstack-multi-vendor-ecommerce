package index

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// insertTombstone chen thang vao bang thay vi goi DeleteProduct: test retention can dat
// deleted_at o moc rat cu (hang thang truoc), ma DeleteProduct chi ghi duoc moc lay tu
// event. Chen thang cung giu test tap trung vao dung phan dang kiem - cau DELETE.
func insertTombstone(t *testing.T, ctx context.Context, pool *pgxpool.Pool, productID string, deletedAt time.Time) {
	t.Helper()

	const q = `INSERT INTO deleted_products_tombstone (product_id, deleted_at) VALUES ($1::uuid, $2)`
	if _, err := pool.Exec(ctx, q, productID, deletedAt); err != nil {
		t.Fatalf("chen tombstone loi: %v", err)
	}
}

// insertProcessedEvent chen thang de dat created_at tuy y. Cot nay co DEFAULT now() nen
// khong ghi tuong minh thi moi row deu la "vua tao" va khong test duoc nguong nao ca.
func insertProcessedEvent(t *testing.T, ctx context.Context, pool *pgxpool.Pool, eventID string, createdAt time.Time) {
	t.Helper()

	const q = `INSERT INTO processed_events (event_id, created_at) VALUES ($1::uuid, $2)`
	if _, err := pool.Exec(ctx, q, eventID, createdAt); err != nil {
		t.Fatalf("chen processed_events loi: %v", err)
	}
}

// readOnlyTombstoneID doc product_id cua row tombstone duy nhat con lai.
func readOnlyTombstoneID(t *testing.T, ctx context.Context, pool *pgxpool.Pool) string {
	t.Helper()

	const q = `SELECT product_id::text FROM deleted_products_tombstone`
	var productID string
	if err := pool.QueryRow(ctx, q).Scan(&productID); err != nil {
		t.Fatalf("doc row tombstone con lai loi: %v", err)
	}
	return productID
}

// TestDeleteExpiredTombstonesGiuRowChuaQuaHan kiem cai quan trong nhat: no xoa DUNG row
// nao. Dem so row khong du - xoa nham row chua qua han van cho ra "da xoa 1 row".
//
// Row chua qua han la thu dang bao ve: no van dang chan event update cu hoi sinh san
// pham da xoa. Xoa nham no la mo lai dung lo hong ma tombstone sinh ra de bit.
func TestDeleteExpiredTombstonesGiuRowChuaQuaHan(t *testing.T) {
	store, pool, ctx := setupTestDB(t)

	before := time.Now().Add(-61 * 24 * time.Hour)
	quaHan := "11111111-1111-1111-1111-111111111111"
	chuaQuaHan := "22222222-2222-2222-2222-222222222222"

	insertTombstone(t, ctx, pool, quaHan, before.Add(-time.Hour))
	insertTombstone(t, ctx, pool, chuaQuaHan, before.Add(time.Hour))

	deleted, err := store.DeleteExpiredTombstones(ctx, before, 100)
	if err != nil {
		t.Fatalf("xoa tombstone qua han loi: %v", err)
	}

	if deleted != 1 {
		t.Errorf("so row da xoa = %d, muon 1", deleted)
	}
	if total := countRows(t, ctx, pool, "deleted_products_tombstone"); total != 1 {
		t.Fatalf("so row con lai = %d, muon 1", total)
	}
	if got := readOnlyTombstoneID(t, ctx, pool); got != chuaQuaHan {
		t.Errorf("row con lai = %s, muon %s (da xoa nham row chua qua han)", got, chuaQuaHan)
	}
}

// TestDeleteExpiredProcessedEventsGiuRowChuaQuaHan: y het test tren nhung cho bang
// processed_events, vi no loc theo created_at chu khong phai deleted_at.
func TestDeleteExpiredProcessedEventsGiuRowChuaQuaHan(t *testing.T) {
	store, pool, ctx := setupTestDB(t)

	before := time.Now().Add(-61 * 24 * time.Hour)
	quaHan := "aaaaaaaa-0000-0000-0000-000000000001"
	chuaQuaHan := "aaaaaaaa-0000-0000-0000-000000000002"

	insertProcessedEvent(t, ctx, pool, quaHan, before.Add(-time.Hour))
	insertProcessedEvent(t, ctx, pool, chuaQuaHan, before.Add(time.Hour))

	deleted, err := store.DeleteExpiredProcessedEvents(ctx, before, 100)
	if err != nil {
		t.Fatalf("xoa processed_events qua han loi: %v", err)
	}

	if deleted != 1 {
		t.Errorf("so row da xoa = %d, muon 1", deleted)
	}

	const q = `SELECT event_id::text FROM processed_events`
	var conLai string
	if err := pool.QueryRow(ctx, q).Scan(&conLai); err != nil {
		t.Fatalf("doc row con lai loi: %v", err)
	}
	if conLai != chuaQuaHan {
		t.Errorf("row con lai = %s, muon %s (da xoa nham row chua qua han)", conLai, chuaQuaHan)
	}
}

// TestDeleteExpiredTonTrongLimit chot tran so row moi lan chay.
//
// Tran nay la thu duy nhat ngan lan chay dau tien om ca bang vao mot transaction tren
// compute nho cua Neon. Mat tran ma khong ai biet thi chi lo ra dung luc te nhat: lan
// deploy dau tien sau khi bat co, khi bang dang lon nhat.
func TestDeleteExpiredTonTrongLimit(t *testing.T) {
	store, pool, ctx := setupTestDB(t)

	before := time.Now().Add(-61 * 24 * time.Hour)
	for i := 0; i < 5; i++ {
		productID := fmt.Sprintf("33333333-3333-3333-3333-00000000000%d", i)
		insertTombstone(t, ctx, pool, productID, before.Add(-time.Duration(i+1)*time.Hour))
	}

	deleted, err := store.DeleteExpiredTombstones(ctx, before, 2)
	if err != nil {
		t.Fatalf("xoa tombstone qua han loi: %v", err)
	}

	if deleted != 2 {
		t.Errorf("so row da xoa = %d, muon 2 (dung bang limit)", deleted)
	}
	if total := countRows(t, ctx, pool, "deleted_products_tombstone"); total != 3 {
		t.Errorf("so row con lai = %d, muon 3", total)
	}
}

// TestDeleteExpiredXoaCuNhatTruoc chot menh de ORDER BY deleted_at trong cau DELETE.
//
// Bo ORDER BY thi cau lenh VAN DUNG (moi row deu qua han) nen khong test nao khac do -
// nhung tien do don ton dong thanh khong the doan truoc, va row cu nhat co the nam lai
// mai qua nhieu tick lien tiep.
func TestDeleteExpiredXoaCuNhatTruoc(t *testing.T) {
	store, pool, ctx := setupTestDB(t)

	before := time.Now().Add(-61 * 24 * time.Hour)
	cuNhat := "44444444-4444-4444-4444-444444444444"
	giua := "55555555-5555-5555-5555-555555555555"
	moiNhat := "66666666-6666-6666-6666-666666666666"

	insertTombstone(t, ctx, pool, cuNhat, before.Add(-72*time.Hour))
	insertTombstone(t, ctx, pool, giua, before.Add(-48*time.Hour))
	insertTombstone(t, ctx, pool, moiNhat, before.Add(-24*time.Hour))

	deleted, err := store.DeleteExpiredTombstones(ctx, before, 1)
	if err != nil {
		t.Fatalf("xoa tombstone qua han loi: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("so row da xoa = %d, muon 1", deleted)
	}

	const q = `SELECT count(*) FROM deleted_products_tombstone WHERE product_id = $1::uuid`
	var conLai int
	if err := pool.QueryRow(ctx, q, cuNhat).Scan(&conLai); err != nil {
		t.Fatalf("kiem row cu nhat loi: %v", err)
	}
	if conLai != 0 {
		t.Errorf("row cu nhat van con - limit 1 phai xoa row cu nhat truoc")
	}
}

// TestDeleteExpiredKhongCoGiQuaHan chot trang thai binh thuong: moi gio ticker chay mot
// lan va thuong khong co gi de xoa. Phai tra 0 chu khong phai loi.
func TestDeleteExpiredKhongCoGiQuaHan(t *testing.T) {
	store, pool, ctx := setupTestDB(t)

	before := time.Now().Add(-61 * 24 * time.Hour)
	insertTombstone(t, ctx, pool, "77777777-7777-7777-7777-777777777777", time.Now())

	deleted, err := store.DeleteExpiredTombstones(ctx, before, 100)
	if err != nil {
		t.Fatalf("xoa tombstone qua han loi: %v", err)
	}
	if deleted != 0 {
		t.Errorf("so row da xoa = %d, muon 0", deleted)
	}
	if total := countRows(t, ctx, pool, "deleted_products_tombstone"); total != 1 {
		t.Errorf("so row con lai = %d, muon 1", total)
	}
}
