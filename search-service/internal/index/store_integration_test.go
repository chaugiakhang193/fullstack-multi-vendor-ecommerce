package index

import (
	"context"
	"errors"
	"net/url"
	"os"
	"strings"
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
				"Test nay xoa du lieu nen chi duoc chay tren Postgres local dung riêng cho test.",
			testDatabaseURLEnv, hostname, allowedTestHosts,
		)
	}

	return databaseURL
}

// setupTestDB dung schema sach: chay migration roi don sach 2 bang truoc moi test.
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
	truncateSQL := `TRUNCATE product_index, processed_events`
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
// Build/vet khong bao gio bat duoc loi SQL — chi chay that moi biet.
func TestMigrationTaoDayDuDoiTuong(t *testing.T) {
	_, pool, ctx := setupTestDB(t)

	tableSQL := `SELECT count(*) FROM pg_tables WHERE schemaname = 'public'
		AND tablename IN ('product_index', 'processed_events')`
	var tableCount int
	if err := pool.QueryRow(ctx, tableSQL).Scan(&tableCount); err != nil {
		t.Fatalf("kiem tra bang loi: %v", err)
	}
	if tableCount != 2 {
		t.Errorf("so bang = %d, muon 2 (product_index + processed_events)", tableCount)
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

// TestUpsertBoQuaEventCu la test QUAN TRONG NHAT cua T7: mot product.updated cu toi SAU
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
		t.Errorf("name = %q, muon %q — event cu da ghi de ban moi, ordering guard hong", got, "ban-moi")
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
		t.Errorf("name = %q, muon %q — dedup khong chan duoc lan gui lai", got, "lan-1")
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
	if err := store.DeleteProduct(ctx, eventDeleted, productID); err != nil {
		t.Fatalf("delete loi: %v", err)
	}
	if total := countRows(t, ctx, pool, "product_index"); total != 0 {
		t.Errorf("so row sau delete = %d, muon 0", total)
	}

	// Gui lai cung event delete: phai bi dedup chan.
	err := store.DeleteProduct(ctx, eventDeleted, productID)
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
	if err := store.DeleteProduct(ctx, eventDeleted, productID); err != nil {
		t.Fatalf("delete product khong ton tai khong duoc bao loi: %v", err)
	}

	if total := countRows(t, ctx, pool, "processed_events"); total != 1 {
		t.Errorf("so processed_events = %d, muon 1 (van danh dau da xu ly)", total)
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
		t.Errorf("host %q bi coi la local — guard hong, test co the chay vao DB that", hostname)
	}
	if !strings.Contains(hostname, "neon.tech") {
		t.Errorf("hostname parse ra %q, khong dung URL mau", hostname)
	}
}
