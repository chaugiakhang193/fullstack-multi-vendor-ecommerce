package search_test

import (
	"strings"
	"testing"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/search-service/internal/search"
)

// TestSearchDetailedTraFieldHienThiVaCapNam: index co 7 san pham khop nhung endpoint chi duoc
// tra ve 5. Total van phai la 7 de bot noi duoc "con nua".
func TestSearchDetailedTraFieldHienThiVaCapNam(t *testing.T) {
	svc, store, ctx := setup(t)

	shopID := "33333333-3333-3333-3333-333333333333"
	for i := 0; i < 7; i++ {
		id := "aaaaaaaa-0000-0000-0000-00000000000" + string(rune('0'+i))
		seedProduct(t, ctx, store, id, "Điện thoại mẫu", "hang tot", "5000000", shopID, nil)
	}

	res, err := svc.SearchDetailed(ctx, search.Request{Query: "dien thoai"})
	if err != nil {
		t.Fatalf("SearchDetailed loi: %v", err)
	}

	if len(res.Items) != 5 {
		t.Fatalf("so item = %d, muon 5 (cap cung)", len(res.Items))
	}
	if res.Total != 7 {
		t.Errorf("Total = %d, muon 7 (tong so khop that, khong phai so item tra ve)", res.Total)
	}

	first := res.Items[0]
	if first.ProductID == "" || first.Name == "" || first.Slug == "" {
		t.Errorf("item thieu field: %+v", first)
	}
	if first.Price != 5000000 {
		t.Errorf("Price = %d, muon 5000000 (round(price)::bigint)", first.Price)
	}
}

// Bay 1: ANY(uuid[]) tra ve theo thu tu Postgres chon. Test nay khoa viec ghep lai dung thu
// tu xep hang. Dat id NGUOC voi ranking: san pham khop-ten mang id LON hon, nen neu code de
// Postgres quyet dinh thu tu thi khop-mo-ta se len truoc.
func TestSearchDetailedGiuThuTuXepHang(t *testing.T) {
	svc, store, ctx := setup(t)

	shopID := "33333333-3333-3333-3333-333333333333"
	nameMatchID := "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
	descMatchID := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	seedProduct(t, ctx, store, nameMatchID, "Điện thoại Samsung", "hang tot", "5000000", shopID, nil)
	seedProduct(t, ctx, store, descMatchID, "Ốp lưng", "cho điện thoại", "50000", shopID, nil)

	res, err := svc.SearchDetailed(ctx, search.Request{Query: "dien thoai"})
	if err != nil {
		t.Fatalf("SearchDetailed loi: %v", err)
	}
	if len(res.Items) != 2 {
		t.Fatalf("so item = %d, muon 2", len(res.Items))
	}
	if res.Items[0].ProductID != nameMatchID {
		t.Errorf("item[0] = %s, muon khop-ten (%s) dung truoc", res.Items[0].ProductID, nameMatchID)
	}
}

// Ten do seller viet: ky tu dieu khien phai bi loai, ten dai phai bi cat theo RUNE.
func TestSearchDetailedDonTenSanPham(t *testing.T) {
	svc, store, ctx := setup(t)

	shopID := "33333333-3333-3333-3333-333333333333"
	id := "cccccccc-cccc-cccc-cccc-cccccccccccc"
	// \n va \x1b (ESC) gia lap ten bi nhet ky tu dieu khien. CO Y khong dung \x00: cot text
	// cua Postgres KHONG luu duoc byte NUL, seed se chet ngay voi loi encoding chu khong
	// kiem duoc gi. ESC moi la thu dang kiem o day — no khong phai whitespace nen
	// strings.Fields bo qua, chi unicode.IsControl bat duoc.
	// Phan duoi keo ten vuot 120 rune bang chu co dau de kiem luon viec dem theo rune.
	dirtyName := "Điện thoại\n\x1b xịn " + strings.Repeat("á", 200)
	seedProduct(t, ctx, store, id, dirtyName, "mo ta", "5000000", shopID, nil)

	res, err := svc.SearchDetailed(ctx, search.Request{Query: "dien thoai"})
	if err != nil {
		t.Fatalf("SearchDetailed loi: %v", err)
	}
	if len(res.Items) != 1 {
		t.Fatalf("so item = %d, muon 1", len(res.Items))
	}

	name := res.Items[0].Name
	if strings.ContainsAny(name, "\n\x00\x1b") {
		t.Errorf("ten van con ky tu dieu khien: %q", name)
	}
	if got := len([]rune(name)); got > 120 {
		t.Errorf("do dai ten = %d rune, muon toi da 120", got)
	}
	// Cat theo byte se xe doi mot chu co dau thanh byte hong; chuoi hop le thi so rune va
	// so lan giai ma thanh cong phai bang nhau.
	if !strings.ContainsRune(name, 'á') {
		t.Errorf("ten mat phan chu co dau sau khi cat: %q", name)
	}
}

func TestSearchDetailedLocGia(t *testing.T) {
	svc, store, ctx := setup(t)

	shopID := "33333333-3333-3333-3333-333333333333"
	reID := "dddddddd-dddd-dddd-dddd-dddddddddddd"
	datID := "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
	seedProduct(t, ctx, store, reID, "Điện thoại rẻ", "hang tot", "3000000", shopID, nil)
	seedProduct(t, ctx, store, datID, "Điện thoại đắt", "hang tot", "20000000", shopID, nil)

	maxPrice := "5000000"
	res, err := svc.SearchDetailed(ctx, search.Request{Query: "dien thoai", MaxPrice: &maxPrice})
	if err != nil {
		t.Fatalf("SearchDetailed loi: %v", err)
	}
	if len(res.Items) != 1 {
		t.Fatalf("so item = %d, muon 1", len(res.Items))
	}
	if res.Items[0].ProductID != reID {
		t.Errorf("item[0] = %s, muon %s (cai duoi 5 trieu)", res.Items[0].ProductID, reID)
	}
}

// Khong khop gi thi Items phai la mang rong chu khong nil, de JSON ra [] chu khong phai null.
func TestSearchDetailedKhongKhopThiItemsRongChuKhongNil(t *testing.T) {
	svc, _, ctx := setup(t)

	res, err := svc.SearchDetailed(ctx, search.Request{Query: "khong co gi khop dau"})
	if err != nil {
		t.Fatalf("SearchDetailed loi: %v", err)
	}
	if res.Items == nil {
		t.Fatal("Items = nil, muon mang rong")
	}
	if len(res.Items) != 0 {
		t.Errorf("so item = %d, muon 0", len(res.Items))
	}
}

func TestSearchDetailedQRongTraErrEmptyQuery(t *testing.T) {
	svc, _, ctx := setup(t)

	if _, err := svc.SearchDetailed(ctx, search.Request{Query: ""}); err == nil {
		t.Fatal("muon loi khi q rong")
	}
}
