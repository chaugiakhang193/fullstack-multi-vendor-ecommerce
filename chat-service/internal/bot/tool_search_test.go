package bot

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const testFrontendURL = "https://shop.example.com"

// newToolServer dung SearchTool tro vao mot httptest.Server thay cho search-service that.
func newToolServer(t *testing.T, handler http.HandlerFunc) *SearchTool {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return NewSearchTool(server.URL, testFrontendURL)
}

func TestExecuteDoiKetQuaThanhPayloadChoModel(t *testing.T) {
	tool := newToolServer(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"items":[{"productId":"p1","name":"Dien thoai A","slug":"dien-thoai-a","price":4990000}],"total":3}`)
	})

	payload := tool.Execute(context.Background(), map[string]any{"query": "dien thoai"})

	if payload["error"] != nil {
		t.Fatalf("payload co error: %v", payload["error"])
	}
	products, ok := payload["products"].([]any)
	if !ok || len(products) != 1 {
		t.Fatalf("products = %v, muon dung 1 phan tu", payload["products"])
	}

	product, ok := products[0].(map[string]any)
	if !ok {
		t.Fatalf("phan tu products khong phai map: %T", products[0])
	}
	if got := product["priceText"]; got != "4.990.000₫" {
		t.Errorf("priceText = %v, muon 4.990.000₫", got)
	}
	if got := product["url"]; got != testFrontendURL+"/products/dien-thoai-a" {
		t.Errorf("url = %v", got)
	}
	// description khong duoc co mat du search-service co lo tra ve: payload chi mang dung
	// bon truong da chon.
	if _, has := product["description"]; has {
		t.Error("payload lot truong description")
	}
	if got := payload["total"]; got != int64(3) {
		t.Errorf("total = %v (%T), muon 3", got, got)
	}
	if payload["note"] == nil {
		t.Error("payload thieu note nhac model coi ket qua la du lieu")
	}
}

// Model cho so duoi dang float64 (JSON) hoac chuoi; ca hai deu phai thanh tham so loc gia.
func TestExecuteGuiKhoangGiaXuongSearchService(t *testing.T) {
	cases := []struct {
		name string
		args map[string]any
		want string
	}{
		{"so float64", map[string]any{"query": "dien thoai", "maxPrice": float64(5000000)}, "max_price=5000000"},
		{"chuoi so", map[string]any{"query": "dien thoai", "maxPrice": "5000000"}, "max_price=5000000"},
		{"gia toi thieu", map[string]any{"query": "dien thoai", "minPrice": float64(1000000)}, "min_price=1000000"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var rawQuery string
			tool := newToolServer(t, func(w http.ResponseWriter, r *http.Request) {
				rawQuery = r.URL.RawQuery
				_, _ = io.WriteString(w, `{"items":[],"total":0}`)
			})

			tool.Execute(context.Background(), tc.args)

			if !strings.Contains(rawQuery, tc.want) {
				t.Errorf("query = %q, muon chua %q", rawQuery, tc.want)
			}
		})
	}
}

// Gia tri rac o tham so gia phai bi BO, khong duoc gui xuong: gui xuong thi search-service
// coi nhu khong loc, va nguoi dung hoi "duoi 5 trieu" lai nhan ve hang 20 trieu.
func TestExecuteBoQuaKhoangGiaKhongDocDuoc(t *testing.T) {
	var rawQuery string
	tool := newToolServer(t, func(w http.ResponseWriter, r *http.Request) {
		rawQuery = r.URL.RawQuery
		_, _ = io.WriteString(w, `{"items":[],"total":0}`)
	})

	tool.Execute(context.Background(), map[string]any{"query": "dien thoai", "maxPrice": "khoang 5 trieu"})

	if strings.Contains(rawQuery, "max_price") {
		t.Errorf("query = %q, khong duoc co max_price khi gia tri khong doc duoc", rawQuery)
	}
}

// Cap 5 kiem lai o phia doc: search-service lo noi cap len thi bot van chi nhin 5 dong.
func TestExecuteCatConNamSanPham(t *testing.T) {
	tool := newToolServer(t, func(w http.ResponseWriter, r *http.Request) {
		items := make([]string, 0, 8)
		for i := 0; i < 8; i++ {
			items = append(items, fmt.Sprintf(`{"productId":"p%d","name":"San pham","slug":"sp-%d","price":1000}`, i, i))
		}
		_, _ = io.WriteString(w, `{"items":[`+strings.Join(items, ",")+`],"total":8}`)
	})

	payload := tool.Execute(context.Background(), map[string]any{"query": "san pham"})

	products, _ := payload["products"].([]any)
	if len(products) != 5 {
		t.Fatalf("so product = %d, muon 5", len(products))
	}
}

func TestExecuteTraPayloadLoiThayViError(t *testing.T) {
	cases := []struct {
		name    string
		handler http.HandlerFunc
	}{
		{"search tra 500", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		}},
		{"body khong phai JSON", func(w http.ResponseWriter, r *http.Request) {
			_, _ = io.WriteString(w, `<html>bad gateway</html>`)
		}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tool := newToolServer(t, tc.handler)

			payload := tool.Execute(context.Background(), map[string]any{"query": "dien thoai"})

			if payload["error"] == nil {
				t.Fatal("muon payload co truong error")
			}
			// products phai co mat va rong: model doc mot hinh dang duy nhat cho moi truong hop.
			products, ok := payload["products"].([]any)
			if !ok || len(products) != 0 {
				t.Errorf("products = %v, muon mang rong", payload["products"])
			}
		})
	}
}

func TestExecuteThieuQueryThiKhongGoiMang(t *testing.T) {
	called := false
	tool := newToolServer(t, func(w http.ResponseWriter, r *http.Request) {
		called = true
	})

	payload := tool.Execute(context.Background(), map[string]any{})

	if payload["error"] == nil {
		t.Fatal("muon payload co truong error")
	}
	if called {
		t.Error("da goi search-service du thieu tu khoa")
	}
}

func TestFormatVND(t *testing.T) {
	cases := []struct {
		in   int64
		want string
	}{
		{0, "0₫"},
		{999, "999₫"},
		{1000, "1.000₫"},
		{4990000, "4.990.000₫"},
		{123456789, "123.456.789₫"},
	}

	for _, tc := range cases {
		if got := FormatVND(tc.in); got != tc.want {
			t.Errorf("FormatVND(%d) = %q, muon %q", tc.in, got, tc.want)
		}
	}
}
