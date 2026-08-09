package index

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Bien moi truong chi toi Postgres DUNG RIENG cho test. Khong dat thi test integration
// bi skip (de `go test ./...` van chay duoc khi khong co Docker).
const testDatabaseURLEnv = "TEST_DATABASE_URL"

// allowedTestHosts la danh sach host duy nhat duoc phep chay test integration.
// Vi sao phai chan: test nay XOA DU LIEU (DROP/TRUNCATE) de don giua cac case. Tung co
// su co chay test trung DB that lam mat du lieu, nen o day chan tu goc: URL tro toi bat
// ky host nao khac localhost deu lam test that bai ngay, khong chay mot cau lenh nao.
var allowedTestHosts = []string{"localhost", "127.0.0.1"}

// requireLocalTestDB doc URL test tu env, skip neu chua dat, va CHAN NGAY neu URL tro
// toi host khong phai local (vd Neon prod).
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

// setupTestDB dung schema sach: chay migration roi don sach 3 bang truoc moi test.
// Tra ve store da san sang va pool phu de test tu doc lai du lieu kiem chung.
func setupTestDB(t *testing.T) (*Store, *pgxpool.Pool, context.Context) {
	t.Helper()

	databaseURL := requireLocalTestDB(t)

	if err := RunMigrations(databaseURL); err != nil {
		t.Fatalf("chay migration loi: %v", err)
	}

	bgCtx := context.Background()
	timeout := 20 * time.Second
	ctx, cancel := context.WithTimeout(bgCtx, timeout)
	t.Cleanup(cancel)

	store, err := NewStore(ctx, databaseURL)
	if err != nil {
		t.Fatalf("mo store loi: %v", err)
	}
	t.Cleanup(store.Close)

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("mo pool kiem chung loi: %v", err)
	}
	t.Cleanup(pool.Close)

	// Don sach de moi test chay tren nen trang, khong phu thuoc thu tu test.
	truncateSQL := `TRUNCATE product_index, processed_events, deleted_products_tombstone`
	if _, err := pool.Exec(ctx, truncateSQL); err != nil {
		t.Fatalf("don bang loi: %v", err)
	}

	return store, pool, ctx
}

// makeDoc tao ProductDoc mau voi ten va moc thoi gian tuy chinh.
func makeDoc(productID string, name string, updatedAt time.Time) ProductDoc {
	description := "mo ta"
	categoryID := "33333333-3333-3333-3333-333333333333"
	thumbnailURL := "https://cdn.example.com/a.webp"

	return ProductDoc{
		ProductID:    productID,
		Name:         name,
		Slug:         "slug-" + name,
		Description:  &description,
		Price:        "150000.00",
		ShopID:       "22222222-2222-2222-2222-222222222222",
		CategoryID:   &categoryID,
		ThumbnailURL: &thumbnailURL,
		Status:       "APPROVED",
		IsHidden:     false,
		UpdatedAt:    updatedAt,
	}
}

// readName doc lai ten dang luu trong index de kiem chung ket qua ghi.
func readName(t *testing.T, ctx context.Context, pool *pgxpool.Pool, productID string) string {
	t.Helper()

	querySQL := `SELECT name FROM product_index WHERE product_id = $1`
	var name string
	if err := pool.QueryRow(ctx, querySQL, productID).Scan(&name); err != nil {
		t.Fatalf("doc lai name loi: %v", err)
	}
	return name
}

// readTombstoneDeletedAt doc moc deleted_at dang luu de kiem chung GREATEST giu dung moc lon nhat.
func readTombstoneDeletedAt(t *testing.T, ctx context.Context, pool *pgxpool.Pool, productID string) time.Time {
	t.Helper()

	querySQL := `SELECT deleted_at FROM deleted_products_tombstone WHERE product_id = $1`
	var deletedAt time.Time
	if err := pool.QueryRow(ctx, querySQL, productID).Scan(&deletedAt); err != nil {
		t.Fatalf("doc tombstone deleted_at loi: %v", err)
	}
	return deletedAt
}

// countRows dem so row trong bang de kiem chung insert/delete.
func countRows(t *testing.T, ctx context.Context, pool *pgxpool.Pool, table string) int {
	t.Helper()

	// table la hang so trong test (khong phai input nguoi dung) nen noi chuoi o day an toan.
	querySQL := "SELECT count(*) FROM " + table
	var total int
	if err := pool.QueryRow(ctx, querySQL).Scan(&total); err != nil {
		t.Fatalf("dem row bang %s loi: %v", table, err)
	}
	return total
}

// TestMigrationTaoDayDuDoiTuong kiem tra migration dung duoc bang, index va extension.
// Build/vet khong bao gio bat duoc loi SQL - chi chay that moi biet.
func TestMigrationTaoDayDuDoiTuong(t *testing.T) {
	_, pool, ctx := setupTestDB(t)

	tableSQL := `SELECT count(*) FROM pg_tables WHERE schemaname = 'public'
		AND tablename IN ('product_index', 'processed_events', 'deleted_products_tombstone')`
	var tableCount int
	if err := pool.QueryRow(ctx, tableSQL).Scan(&tableCount); err != nil {
		t.Fatalf("kiem tra bang loi: %v", err)
	}
	if tableCount != 3 {
		t.Errorf("so bang = %d, muon 3 (product_index + processed_events + deleted_products_tombstone)", tableCount)
	}

	extensionSQL := `SELECT count(*) FROM pg_extension WHERE extname IN ('unaccent', 'pg_trgm')`
	var extensionCount int
	if err := pool.QueryRow(ctx, extensionSQL).Scan(&extensionCount); err != nil {
		t.Fatalf("kiem tra extension loi: %v", err)
	}
	if extensionCount != 2 {
		t.Errorf("so extension = %d, muon 2 (unaccent + pg_trgm)", extensionCount)
	}

	indexSQL := `SELECT count(*) FROM pg_indexes WHERE tablename = 'product_index'
		AND indexname = 'product_index_search_vector_gin'`
	var indexCount int
	if err := pool.QueryRow(ctx, indexSQL).Scan(&indexCount); err != nil {
		t.Fatalf("kiem tra index loi: %v", err)
	}
	if indexCount != 1 {
		t.Errorf("so GIN index = %d, muon 1", indexCount)
	}
}

// TestUpsertChenMoiRoiCapNhat kiem tra luong thuan: created chen row, updated ghi de.
func TestUpsertChenMoiRoiCapNhat(t *testing.T) {
	store, pool, ctx := setupTestDB(t)

	productID := "11111111-1111-1111-1111-111111111111"
	baseTime := time.Date(2026, 8, 1, 10, 0, 0, 0, time.UTC)

	docCu := makeDoc(productID, "ten-cu", baseTime)
	eventCreated := "aaaaaaaa-0000-0000-0000-000000000001"
	if err := store.UpsertProduct(ctx, eventCreated, docCu); err != nil {
		t.Fatalf("upsert lan dau loi: %v", err)
	}
	if got := readName(t, ctx, pool, productID); got != "ten-cu" {
		t.Errorf("sau chen: name = %q, muon %q", got, "ten-cu")
	}

	moctMoi := baseTime.Add(1 * time.Hour)
	docMoi := makeDoc(productID, "ten-moi", moctMoi)
	eventUpdated := "aaaaaaaa-0000-0000-0000-000000000002"
	if err := store.UpsertProduct(ctx, eventUpdated, docMoi); err != nil {
		t.Fatalf("upsert cap nhat loi: %v", err)
	}
	if got := readName(t, ctx, pool, productID); got != "ten-moi" {
		t.Errorf("sau cap nhat: name = %q, muon %q", got, "ten-moi")
	}

	if total := countRows(t, ctx, pool, "product_index"); total != 1 {
		t.Errorf("so row = %d, muon 1 (upsert khong duoc nhan ban)", total)
	}
}

// TestUpsertBoQuaEventCu la test QUAN TRONG NHAT: mot product.updated cu toi SAU
// ban moi (RabbitMQ khong bao dam thu tu) KHONG duoc ghi de ban moi.
func TestUpsertBoQuaEventCu(t *testing.T) {
	store, pool, ctx := setupTestDB(t)

	productID := "11111111-1111-1111-1111-111111111111"
	baseTime := time.Date(2026, 8, 1, 10, 0, 0, 0, time.UTC)

	mocMoi := baseTime.Add(1 * time.Hour)
	docMoi := makeDoc(productID, "ban-moi", mocMoi)
	eventMoi := "bbbbbbbb-0000-0000-0000-000000000001"
	if err := store.UpsertProduct(ctx, eventMoi, docMoi); err != nil {
		t.Fatalf("upsert ban moi loi: %v", err)
	}

	// Event cu hon toi sau: eventId khac (khong bi dedup chan) nhung moc thoi gian cu hon.
	docCu := makeDoc(productID, "ban-cu-toi-sau", baseTime)
	eventCu := "bbbbbbbb-0000-0000-0000-000000000002"
	if err := store.UpsertProduct(ctx, eventCu, docCu); err != nil {
		t.Fatalf("upsert ban cu khong duoc bao loi (chi im lang bo qua): %v", err)
	}

	got := readName(t, ctx, pool, productID)
	if got != "ban-moi" {
		t.Errorf("name = %q, muon %q - event cu da ghi de ban moi, ordering guard hong", got, "ban-moi")
	}
}

// TestUpsertTrungEventIDBiChan kiem tra idempotency: cung eventId gui lai (redelivery cua
// RabbitMQ at-least-once) phai tra ErrDuplicateEvent va KHONG ap dung lan hai.
func TestUpsertTrungEventIDBiChan(t *testing.T) {
	store, pool, ctx := setupTestDB(t)

	productID := "11111111-1111-1111-1111-111111111111"
	baseTime := time.Date(2026, 8, 1, 10, 0, 0, 0, time.UTC)
	eventID := "cccccccc-0000-0000-0000-000000000001"

	docLan1 := makeDoc(productID, "lan-1", baseTime)
	if err := store.UpsertProduct(ctx, eventID, docLan1); err != nil {
		t.Fatalf("upsert lan 1 loi: %v", err)
	}

	// Gui lai CUNG eventId nhung noi dung khac + moc moi hon: neu dedup hong thi ten se doi.
	mocMoi := baseTime.Add(1 * time.Hour)
	docLan2 := makeDoc(productID, "lan-2", mocMoi)
	err := store.UpsertProduct(ctx, eventID, docLan2)
	if !errors.Is(err, ErrDuplicateEvent) {
		t.Fatalf("loi = %v, muon ErrDuplicateEvent", err)
	}

	if got := readName(t, ctx, pool, productID); got != "lan-1" {
		t.Errorf("name = %q, muon %q - dedup khong chan duoc lan gui lai", got, "lan-1")
	}
	if total := countRows(t, ctx, pool, "processed_events"); total != 1 {
		t.Errorf("so processed_events = %d, muon 1", total)
	}
}

// TestDeleteXoaDocumentVaDedup kiem tra product.deleted xoa row, va gui lai cung eventId
// thi bi dedup chan.
func TestDeleteXoaDocumentVaDedup(t *testing.T) {
	store, pool, ctx := setupTestDB(t)

	productID := "11111111-1111-1111-1111-111111111111"
	baseTime := time.Date(2026, 8, 1, 10, 0, 0, 0, time.UTC)

	doc := makeDoc(productID, "se-bi-xoa", baseTime)
	eventCreated := "dddddddd-0000-0000-0000-000000000001"
	if err := store.UpsertProduct(ctx, eventCreated, doc); err != nil {
		t.Fatalf("upsert truoc khi xoa loi: %v", err)
	}

	eventDeleted := "dddddddd-0000-0000-0000-000000000002"
	deletedAt := baseTime.Add(30 * time.Minute)
	if err := store.DeleteProduct(ctx, eventDeleted, productID, deletedAt); err != nil {
		t.Fatalf("delete loi: %v", err)
	}
	if total := countRows(t, ctx, pool, "product_index"); total != 0 {
		t.Errorf("so row sau delete = %d, muon 0", total)
	}

	// Gui lai cung event delete: phai bi dedup chan.
	err := store.DeleteProduct(ctx, eventDeleted, productID, deletedAt)
	if !errors.Is(err, ErrDuplicateEvent) {
		t.Errorf("loi = %v, muon ErrDuplicateEvent khi gui lai delete", err)
	}
}

// TestDeleteProductKhongTonTaiKhongLoi kiem tra xoa product chua tung vao index van coi la
// thanh cong (DELETE 0 row). Tinh huong that: event deleted toi truoc event created.
func TestDeleteProductKhongTonTaiKhongLoi(t *testing.T) {
	store, pool, ctx := setupTestDB(t)

	productID := "99999999-9999-9999-9999-999999999999"
	eventDeleted := "eeeeeeee-0000-0000-0000-000000000001"
	deletedAt := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
	if err := store.DeleteProduct(ctx, eventDeleted, productID, deletedAt); err != nil {
		t.Fatalf("delete product khong ton tai khong duoc bao loi: %v", err)
	}

	if total := countRows(t, ctx, pool, "processed_events"); total != 1 {
		t.Errorf("so processed_events = %d, muon 1 (van danh dau da xu ly)", total)
	}
}

// TestDeletedThenOldUpdated kiem tra khi event delete toi truoc, event update cu toi sau se bi tombstone guard chan.
func TestDeletedThenOldUpdated(t *testing.T) {
	store, pool, ctx := setupTestDB(t)

	productID := "11111111-1111-1111-1111-111111111111"
	baseTime := time.Date(2026, 8, 1, 10, 0, 0, 0, time.UTC)

	doc := makeDoc(productID, "product-a", baseTime)
	eventCreated := "f1111111-0000-0000-0000-000000000001"
	if err := store.UpsertProduct(ctx, eventCreated, doc); err != nil {
		t.Fatalf("upsert created loi: %v", err)
	}

	deletedAt := baseTime.Add(2 * time.Hour)
	eventDeleted := "f1111111-0000-0000-0000-000000000002"
	if err := store.DeleteProduct(ctx, eventDeleted, productID, deletedAt); err != nil {
		t.Fatalf("delete loi: %v", err)
	}

	oldUpdatedAt := baseTime.Add(1 * time.Hour)
	oldDoc := makeDoc(productID, "product-a-old-update", oldUpdatedAt)
	eventOldUpdate := "f1111111-0000-0000-0000-000000000003"
	err := store.UpsertProduct(ctx, eventOldUpdate, oldDoc)
	if !errors.Is(err, ErrTombstoneBlocked) {
		t.Errorf("loi = %v, muon ErrTombstoneBlocked vi event update cu den sau delete", err)
	}

	if total := countRows(t, ctx, pool, "product_index"); total != 0 {
		t.Errorf("so row product_index = %d, muon 0 (tombstone phai chan khong cho hoi sinh)", total)
	}
}

// TestNewerUpdatedThenOldDeleted kiem tra khi event update moi toi truoc, event delete cu toi sau se khong xoa nham row update moi.
func TestNewerUpdatedThenOldDeleted(t *testing.T) {
	store, pool, ctx := setupTestDB(t)

	productID := "22222222-2222-2222-2222-222222222222"
	baseTime := time.Date(2026, 8, 1, 10, 0, 0, 0, time.UTC)

	newUpdatedAt := baseTime.Add(2 * time.Hour)
	newDoc := makeDoc(productID, "product-b-new", newUpdatedAt)
	eventUpdated := "f2222222-0000-0000-0000-000000000001"
	if err := store.UpsertProduct(ctx, eventUpdated, newDoc); err != nil {
		t.Fatalf("upsert product-b loi: %v", err)
	}

	oldDeletedAt := baseTime.Add(1 * time.Hour)
	eventOldDeleted := "f2222222-0000-0000-0000-000000000002"
	if err := store.DeleteProduct(ctx, eventOldDeleted, productID, oldDeletedAt); err != nil {
		t.Fatalf("delete cu loi: %v", err)
	}

	if total := countRows(t, ctx, pool, "product_index"); total != 1 {
		t.Errorf("so row product_index = %d, muon 1 (delete cu den sau khong duoc xoa row moi)", total)
	}
	if got := readName(t, ctx, pool, productID); got != "product-b-new" {
		t.Errorf("name = %q, muon %q", got, "product-b-new")
	}
}

// TestNewerUpdatedAfterTombstone kiem tra khi product duoc restore/re-created (event update moi hon deleted_at), tombstone bi xoa va row duoc re-created.
func TestNewerUpdatedAfterTombstone(t *testing.T) {
	store, pool, ctx := setupTestDB(t)

	productID := "33333333-3333-3333-3333-333333333333"
	baseTime := time.Date(2026, 8, 1, 10, 0, 0, 0, time.UTC)

	deletedAt := baseTime.Add(1 * time.Hour)
	eventDeleted := "f3333333-0000-0000-0000-000000000001"
	if err := store.DeleteProduct(ctx, eventDeleted, productID, deletedAt); err != nil {
		t.Fatalf("delete initial loi: %v", err)
	}

	if total := countRows(t, ctx, pool, "deleted_products_tombstone"); total != 1 {
		t.Fatalf("so row tombstone = %d, muon 1", total)
	}

	newerUpdatedAt := baseTime.Add(2 * time.Hour)
	newerDoc := makeDoc(productID, "product-c-restored", newerUpdatedAt)
	eventRestored := "f3333333-0000-0000-0000-000000000002"
	if err := store.UpsertProduct(ctx, eventRestored, newerDoc); err != nil {
		t.Fatalf("upsert restored product loi: %v", err)
	}

	if total := countRows(t, ctx, pool, "deleted_products_tombstone"); total != 0 {
		t.Errorf("so row tombstone sau restore = %d, muon 0", total)
	}
	if total := countRows(t, ctx, pool, "product_index"); total != 1 {
		t.Errorf("so row product_index sau restore = %d, muon 1", total)
	}
	if got := readName(t, ctx, pool, productID); got != "product-c-restored" {
		t.Errorf("name = %q, muon %q", got, "product-c-restored")
	}
}

// TestConcurrentUpdateDelete chay 10 goroutine update/delete xen ke tren cung 1 product_id.
//
// Thu tu chay ngau nhien nhung ket qua cuoi la TAT DINH: worker so le mang moc lon nhat la
// worker 9 (delete tai baseTime+9m), trong khi moi upsert deu <= baseTime+8m. Sau khi worker
// 9 chay, tombstone o moc 9m khong upsert nao vuot qua duoc nen khong ai xoa duoc tombstone
// va khong ai hoi sinh duoc row. Vi vay luon ket thuc o: index rong, tombstone dung 1 row
// tai moc 9m. Truoc day test chi t.Logf nen chi bat duoc panic, khong bat duoc ket qua sai.
func TestConcurrentUpdateDelete(t *testing.T) {
	store, pool, ctx := setupTestDB(t)

	productID := "44444444-4444-4444-4444-444444444444"
	baseTime := time.Date(2026, 8, 1, 10, 0, 0, 0, time.UTC)

	var wg sync.WaitGroup
	workers := 10
	// Moi goroutine ghi vao mot o rieng nen khong can mutex.
	errs := make([]error, workers)

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			eventID := fmt.Sprintf("f4444444-0000-0000-0000-%012d", i)
			moc := baseTime.Add(time.Duration(i) * time.Minute)
			if i%2 == 0 {
				errs[i] = store.UpsertProduct(ctx, eventID, makeDoc(productID, fmt.Sprintf("name-%d", i), moc))
			} else {
				errs[i] = store.DeleteProduct(ctx, eventID, productID, moc)
			}
		}()
	}

	wg.Wait()

	// Chi nil hoac ErrTombstoneBlocked moi hop le. Moi loi khac (deadlock, serialization
	// failure, mat ket noi) la that bai that su, truoc day bi nuot sach boi `_ =`.
	for i, err := range errs {
		if err != nil && !errors.Is(err, ErrTombstoneBlocked) {
			t.Errorf("worker %d: loi khong mong doi: %v", i, err)
		}
	}

	if total := countRows(t, ctx, pool, "product_index"); total != 0 {
		t.Errorf("so row product_index = %d, muon 0 (delete moc lon nhat phai thang moi upsert)", total)
	}
	if total := countRows(t, ctx, pool, "deleted_products_tombstone"); total != 1 {
		t.Errorf("so row tombstone = %d, muon 1", total)
	}
	if total := countRows(t, ctx, pool, "processed_events"); total != workers {
		t.Errorf("so processed_events = %d, muon %d (moi event deu phai duoc danh dau da xu ly)", total, workers)
	}

	mocLonNhat := baseTime.Add(time.Duration(workers-1) * time.Minute)
	if got := readTombstoneDeletedAt(t, ctx, pool, productID); !got.Equal(mocLonNhat) {
		t.Errorf("tombstone deleted_at = %v, muon %v (GREATEST phai giu moc lon nhat)", got, mocLonNhat)
	}
}

// TestGuardChanHostKhongPhaiLocal kiem tra chinh cai guard an toan: URL tro toi host la
// phai bi tu choi. Chay bang subtest rieng de khong lam hong cac test khac.
func TestGuardChanHostKhongPhaiLocal(t *testing.T) {
	remoteURL := "postgresql://user:pass@ep-abc.neon.tech/searchdb?sslmode=require"
	parsed, err := url.Parse(remoteURL)
	if err != nil {
		t.Fatalf("parse URL mau loi: %v", err)
	}

	hostname := parsed.Hostname()
	isAllowed := false
	for _, allowed := range allowedTestHosts {
		if hostname == allowed {
			isAllowed = true
			break
		}
	}
	if isAllowed {
		t.Errorf("host %q bi coi la local - guard hong, test co the chay vao DB that", hostname)
	}
	if !strings.Contains(hostname, "neon.tech") {
		t.Errorf("hostname parse ra %q, khong dung URL mau", hostname)
	}
}
