package bot

import (
	"testing"
	"time"
)

// newTestCache dung cache voi dong ho dieu khien duoc. Con tro tra ve la de test tua thoi gian
// toi bang cach gan lai gia tri.
func newTestCache(t *testing.T, max int) (*ReplyCache, *time.Time) {
	t.Helper()

	clock := time.Date(2026, 8, 21, 14, 30, 0, 0, time.UTC)
	cache := NewReplyCache(DefaultReplyCacheTTL, max)
	cache.now = func() time.Time { return clock }
	return cache, &clock
}

func TestCacheTraLaiCauTraLoiTrongHan(t *testing.T) {
	cache, _ := newTestCache(t, DefaultReplyCacheMaxEntries)

	cache.Put("co dien thoai nao duoi 5 trieu khong", "co, day la 5 san pham")

	got, ok := cache.Get("co dien thoai nao duoi 5 trieu khong")
	if !ok {
		t.Fatal("cau vua luu phai lay lai duoc")
	}
	if got != "co, day la 5 san pham" {
		t.Errorf("noi dung = %q, khong khop cai da luu", got)
	}
}

func TestCacheGopCacBienTheGoTay(t *testing.T) {
	cache, _ := newTestCache(t, DefaultReplyCacheMaxEntries)

	cache.Put("Co dien thoai nao duoi 5 trieu khong", "cau tra loi")

	variants := []string{
		"co dien thoai nao duoi 5 trieu khong",
		"  CO DIEN THOAI NAO DUOI 5 TRIEU KHONG  ",
		"co dien thoai   nao duoi 5    trieu khong",
	}
	for _, variant := range variants {
		if _, ok := cache.Get(variant); !ok {
			t.Errorf("bien the %q phai trung khoa voi cau goc", variant)
		}
	}
}

func TestCachePhanBietCauKhacNhau(t *testing.T) {
	cache, _ := newTestCache(t, DefaultReplyCacheMaxEntries)

	cache.Put("co dien thoai nao duoi 5 trieu khong", "cau tra loi A")

	if _, ok := cache.Get("co laptop nao duoi 5 trieu khong"); ok {
		t.Fatal("cau hoi khac phai la cache miss")
	}
}

func TestCacheHetHanSauTTL(t *testing.T) {
	cache, clock := newTestCache(t, DefaultReplyCacheMaxEntries)

	cache.Put("cau hoi", "cau tra loi")

	*clock = clock.Add(DefaultReplyCacheTTL - time.Second)
	if _, ok := cache.Get("cau hoi"); !ok {
		t.Fatal("truoc han 1 giay van phai con")
	}

	*clock = clock.Add(2 * time.Second)
	if _, ok := cache.Get("cau hoi"); ok {
		t.Fatal("qua han thi phai la cache miss")
	}
	if cache.Len() != 0 {
		t.Errorf("entry het han phai bi xoa luc doc trung, con lai %d", cache.Len())
	}
}

func TestCacheDungMocHetHanTinhLaHetHan(t *testing.T) {
	cache, clock := newTestCache(t, DefaultReplyCacheMaxEntries)

	cache.Put("cau hoi", "cau tra loi")

	// Bien chinh xac: entry song DUNG 10 phut, khong phai 10 phut cong mot khoanh khac. Hai test
	// TTL-1s va TTL+1s o tren khong cham toi diem nay nen doi ">" thanh ">=" chung van xanh.
	*clock = clock.Add(DefaultReplyCacheTTL)
	if _, ok := cache.Get("cau hoi"); ok {
		t.Fatal("dung moc expiresAt phai tinh la het han")
	}
}

func TestCacheBoQuaCauTraLoiRong(t *testing.T) {
	cache, _ := newTestCache(t, DefaultReplyCacheMaxEntries)

	cache.Put("cau hoi", "")

	if cache.Len() != 0 {
		t.Fatal("cau tra loi rong khong duoc luu - luu la nhan ban su co cho ca 10 phut")
	}
}

func TestCacheDayThiQuetTruocKhiTuChoi(t *testing.T) {
	cache, clock := newTestCache(t, 2)

	cache.Put("cau 1", "tra loi 1")
	cache.Put("cau 2", "tra loi 2")
	if cache.Len() != 2 {
		t.Fatalf("dang giu %d entry, mong doi 2", cache.Len())
	}

	// Cache day va moi entry con han: khong duoi ai ca, cau moi khong duoc luu.
	cache.Put("cau 3", "tra loi 3")
	if _, ok := cache.Get("cau 3"); ok {
		t.Error("cache day va chua entry nao het han thi khong duoc luu them")
	}

	// Sau khi hai entry cu het han, mot lan ghi moi phai quet duoc cho.
	*clock = clock.Add(DefaultReplyCacheTTL + time.Second)
	cache.Put("cau 4", "tra loi 4")
	if _, ok := cache.Get("cau 4"); !ok {
		t.Error("entry cu da het han, cau moi phai duoc luu")
	}
}

func TestNormalizeQuestionGiuDauTiengViet(t *testing.T) {
	// Hai cau chi khac dau phai cho hai khoa khac nhau.
	if normalizeQuestion("co dien") == normalizeQuestion("có điện") {
		t.Error("bo dau tieng Viet dang lam hai cau khac nghia trung khoa")
	}
}
