package search_test

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/search-service/internal/index"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/search-service/internal/search"
)

// Guard y het store_integration_test: chi chay tren Postgres local (test co the xoa data).
const testDatabaseURLEnv = "TEST_DATABASE_URL"

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
	host := parsed.Hostname()
	for _, allowed := range allowedTestHosts {
		if host == allowed {
			return databaseURL
		}
	}
	t.Fatalf("TU CHOI CHAY: %s tro toi host %q khong nam trong %v", testDatabaseURLEnv, host, allowedTestHosts)
	return ""
}

// eventSeq sinh event_id duy nhat cho moi lan seed. processed_events.event_id la cot uuid
// nen event_id PHAI la uuid hop le (khong the ghep "evt-"+productID). Dinh dang mot uuid
// tu bo dem, giong style cac uuid tinh trong store_integration_test.
var eventSeq atomic.Uint64

func nextEventID() string {
	return fmt.Sprintf("ffffffff-0000-0000-0000-%012d", eventSeq.Add(1))
}

// seedProduct chen 1 product qua index.Store (trigger tu dien search_vector). status
// = 'active' de qua duoc filter cua search. event_id lay tu nextEventID de moi lan khac nhau.
func seedProduct(t *testing.T, ctx context.Context, store *index.Store, id, name, desc, price, shopID string, catID *string) {
	t.Helper()
	d := desc
	doc := index.ProductDoc{
		ProductID: id, Name: name, Slug: "slug-" + id, Description: &d,
		Price: price, ShopID: shopID, CategoryID: catID,
		Status: "active", IsHidden: false, UpdatedAt: time.Now().UTC(),
	}
	if err := store.UpsertProduct(ctx, nextEventID(), doc); err != nil {
		t.Fatalf("seed product %s loi: %v", id, err)
	}
}

// searchTestDBName la database rieng cho package test nay. Vi sao tach rieng: lenh
// `go test ./internal/...` chay binary cua package index va search SONG SONG (mac dinh
// -p = so CPU). Ca hai deu TRUNCATE product_index/processed_events; dung chung 1 database
// se deadlock + xoa nham du lieu cua nhau. Tach database => moi package so huu bang rieng,
// chay song song an toan, lenh verify khong can them -p 1.
const searchTestDBName = "sv_search_test"

// dedicatedDBURL tao (neu chua co) database rieng tren cung server Postgres roi tra ve URL
// tro toi no. adminURL la URL test goc (da qua guard localhost cua requireLocalTestDB).
func dedicatedDBURL(t *testing.T, adminURL string) string {
	t.Helper()
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, adminURL)
	if err != nil {
		t.Fatalf("mo pool admin loi: %v", err)
	}
	defer admin.Close()

	var exists bool
	if err := admin.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1)", searchTestDBName).Scan(&exists); err != nil {
		t.Fatalf("kiem tra database ton tai loi: %v", err)
	}
	if !exists {
		// searchTestDBName la hang so trong test (khong phai input nguoi dung) nen noi chuoi an toan.
		if _, err := admin.Exec(ctx, "CREATE DATABASE "+searchTestDBName); err != nil {
			t.Fatalf("tao database %s loi: %v", searchTestDBName, err)
		}
	}

	u, err := url.Parse(adminURL)
	if err != nil {
		t.Fatalf("parse adminURL loi: %v", err)
	}
	u.Path = "/" + searchTestDBName
	return u.String()
}

func setup(t *testing.T) (*search.Service, *index.Store, context.Context) {
	t.Helper()
	dbURL := dedicatedDBURL(t, requireLocalTestDB(t))
	if err := index.RunMigrations(dbURL); err != nil {
		t.Fatalf("migration loi: %v", err)
	}
	ctx := context.Background()
	store, err := index.NewStore(ctx, dbURL)
	if err != nil {
		t.Fatalf("mo store loi: %v", err)
	}
	t.Cleanup(store.Close)

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("mo pool don loi: %v", err)
	}
	t.Cleanup(pool.Close)
	if _, err := pool.Exec(ctx, "TRUNCATE product_index, processed_events"); err != nil {
		t.Fatalf("truncate loi: %v", err)
	}

	return search.NewService(store.Pool()), store, ctx
}

// TestSearchXepHangVaBoDau: khop ten (rank A) tren khop mo ta (rank B); go khong dau ra co dau.
// CO Y dat id nguoc voi ranking: san pham khop-ten mang id LON hon (bbbb...), khop-mo-ta id NHO
// hon (aaaa...). Tie-break `product_id` ASC se dua khop-mo-ta len truoc NEU ranking hong — nho
// vay test that su kiem RANKING, khong pass nho tie-break trung huong.
func TestSearchXepHangVaBoDau(t *testing.T) {
	svc, store, ctx := setup(t)

	shopID := "33333333-3333-3333-3333-333333333333"
	nameMatchID := "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" // "dien thoai" trong TEN → rank A (cao), id LON
	descMatchID := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" // "dien thoai" chi trong MO TA → rank B (thap), id NHO
	seedProduct(t, ctx, store, nameMatchID, "Điện thoại Samsung", "hang tot", "5000000", shopID, nil)
	seedProduct(t, ctx, store, descMatchID, "Ốp lưng", "cho điện thoại", "50000", shopID, nil)

	res, err := svc.Search(ctx, search.Request{Query: "dien thoai", Page: 1, Limit: 20})
	if err != nil {
		t.Fatalf("search loi: %v", err)
	}
	if res.Total != 2 {
		t.Fatalf("total = %d, muon 2", res.Total)
	}
	if len(res.Items) != 2 {
		t.Fatalf("items = %d, muon 2", len(res.Items))
	}
	// Khop ten (rank A) phai dung TRUOC khop mo ta (rank B) — du id cua no LON hon (tie-break nguoc).
	if res.Items[0].ProductID != nameMatchID {
		t.Errorf("item[0] = %s, muon khop-ten (%s) xep tren nho rank cao hon", res.Items[0].ProductID, nameMatchID)
	}
}

// TestSearchLocGia: min_price loai product re hon.
func TestSearchLocGia(t *testing.T) {
	svc, store, ctx := setup(t)
	shopID := "22222222-2222-2222-2222-222222222222"
	seedProduct(t, ctx, store, "11111111-1111-1111-1111-111111111111", "Điện thoại xịn", "", "5000000", shopID, nil)
	seedProduct(t, ctx, store, "22222222-2222-2222-2222-222222222221", "Điện thoại rẻ", "", "500000", shopID, nil)

	min := "1000000"
	res, err := svc.Search(ctx, search.Request{Query: "dien thoai", Page: 1, Limit: 20, MinPrice: &min})
	if err != nil {
		t.Fatalf("search loi: %v", err)
	}
	if res.Total != 1 || len(res.Items) != 1 {
		t.Fatalf("total=%d items=%d, muon 1 (chi con product >= 1tr)", res.Total, len(res.Items))
	}
	if res.Items[0].ProductID != "11111111-1111-1111-1111-111111111111" {
		t.Errorf("con lai sai product: %s", res.Items[0].ProductID)
	}
}

// TestSearchQRong: q rong tra ErrEmptyQuery.
func TestSearchQRong(t *testing.T) {
	svc, _, ctx := setup(t)
	if _, err := svc.Search(ctx, search.Request{Query: "", Page: 1, Limit: 20}); err == nil {
		t.Fatal("q rong phai bao loi ErrEmptyQuery")
	}
}

// TestSearchTrigramMotPhanVaTypo: FTS chi khop nguyen lexeme nen go do "die" hay sai chinh ta
// "dienn" se rong -> nhanh trigram vot. "dien" nguyen ven van qua FTS; rac khong khop gi ca hai.
func TestSearchTrigramMotPhanVaTypo(t *testing.T) {
	svc, store, ctx := setup(t)
	shopID := "44444444-4444-4444-4444-444444444444"
	seedProduct(t, ctx, store, "44444444-4444-4444-4444-444444444441", "Điện thoại Athena", "", "5000000", shopID, nil)

	cases := []struct {
		name    string
		query   string
		wantMin int
		wantMax int // -1 = khong gioi han tren
	}{
		{"mot phan dau tu", "die", 1, -1},   // FTS rong -> trigram vot
		{"sai chinh ta", "dienn", 1, -1},    // typo -> trigram van bat
		{"tu nguyen ven qua FTS", "dien", 1, -1},
		{"rac khong khop", "zzzzz", 0, 0},   // ca FTS lan trigram deu 0
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res, err := svc.Search(ctx, search.Request{Query: tc.query, Page: 1, Limit: 20})
			if err != nil {
				t.Fatalf("q=%q search loi: %v", tc.query, err)
			}
			if len(res.Items) < tc.wantMin {
				t.Fatalf("q=%q: muon >=%d ket qua, nhan %d", tc.query, tc.wantMin, len(res.Items))
			}
			if tc.wantMax >= 0 && len(res.Items) > tc.wantMax {
				t.Fatalf("q=%q: muon <=%d ket qua, nhan %d", tc.query, tc.wantMax, len(res.Items))
			}
		})
	}
}
