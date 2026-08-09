package broker

import (
	"testing"
	"time"
)

// strPtr tra con tro toi chuoi, dung cho cac field nullable trong ProductSnapshot.
func strPtr(s string) *string {
	return &s
}

// TestToProductDocParseUpdatedAt kiem tra parse updatedAt tu ISO 8601. Day la field
// quan trong nhat cua payload: no la can cu de BO QUA event cu (upsert so updated_at).
// Parse sai hoac parse hong ma van cho di tiep se lam index ghi de bang du lieu cu.
func TestToProductDocParseUpdatedAt(t *testing.T) {
	testCases := []struct {
		name      string
		updatedAt string
		wantErr   bool
		wantUTC   string
	}{
		{
			name:      "ISO 8601 co giay le (dang JS toISOString sinh ra)",
			updatedAt: "2026-08-01T10:20:56.789Z",
			wantErr:   false,
			wantUTC:   "2026-08-01T10:20:56.789Z",
		},
		{
			name:      "ISO 8601 khong giay le",
			updatedAt: "2026-08-01T10:20:56Z",
			wantErr:   false,
			wantUTC:   "2026-08-01T10:20:56Z",
		},
		{
			name:      "co offset mui gio, phai quy ve UTC dung",
			updatedAt: "2026-08-01T17:20:56+07:00",
			wantErr:   false,
			wantUTC:   "2026-08-01T10:20:56Z",
		},
		{
			name:      "chuoi rong phai bao loi, khong duoc coi la moc zero",
			updatedAt: "",
			wantErr:   true,
		},
		{
			name:      "dinh dang khong phai RFC3339 phai bao loi",
			updatedAt: "01/08/2026 10:20:56",
			wantErr:   true,
		},
	}

	for _, tc := range testCases {
		testCase := tc
		t.Run(testCase.name, func(t *testing.T) {
			snapshot := ProductSnapshot{
				ProductID: "11111111-1111-1111-1111-111111111111",
				Name:      "Ao thun",
				Slug:      "ao-thun",
				Price:     "150000.00",
				ShopID:    "22222222-2222-2222-2222-222222222222",
				Status:    "APPROVED",
				IsHidden:  false,
				UpdatedAt: testCase.updatedAt,
			}

			doc, err := toProductDoc(snapshot)

			if testCase.wantErr {
				if err == nil {
					t.Fatalf("muon loi voi updatedAt=%q nhung khong co loi", testCase.updatedAt)
				}
				return
			}
			if err != nil {
				t.Fatalf("khong muon loi nhung nhan: %v", err)
			}

			layout := time.RFC3339Nano
			gotUTC := doc.UpdatedAt.UTC().Format(layout)
			wantTime, parseErr := time.Parse(time.RFC3339, testCase.wantUTC)
			if parseErr != nil {
				t.Fatalf("moc mong doi trong test viet sai: %v", parseErr)
			}
			wantUTCFormatted := wantTime.UTC().Format(layout)
			if gotUTC != wantUTCFormatted {
				t.Errorf("updatedAt = %s, muon %s", gotUTC, wantUTCFormatted)
			}
		})
	}
}

// TestToProductDocGiuNguyenTruongNullable kiem tra cac con tro nullable di qua nguyen ven.
// Neu vo tinh deref hoac gan nham, description/categoryId/thumbnailUrl se thanh chuoi rong
// thay vi NULL trong DB - khac nghia hoan toan khi W3 loc/hien thi.
func TestToProductDocGiuNguyenTruongNullable(t *testing.T) {
	description := "Mo ta san pham"
	categoryID := "33333333-3333-3333-3333-333333333333"
	thumbnailURL := "https://cdn.example.com/a.webp"

	snapshot := ProductSnapshot{
		ProductID:    "11111111-1111-1111-1111-111111111111",
		Name:         "Ao thun",
		Slug:         "ao-thun",
		Description:  strPtr(description),
		Price:        "150000.00",
		ShopID:       "22222222-2222-2222-2222-222222222222",
		CategoryID:   strPtr(categoryID),
		ThumbnailURL: strPtr(thumbnailURL),
		Status:       "APPROVED",
		IsHidden:     true,
		UpdatedAt:    "2026-08-01T10:20:56.789Z",
	}

	doc, err := toProductDoc(snapshot)
	if err != nil {
		t.Fatalf("khong muon loi nhung nhan: %v", err)
	}

	if doc.Description == nil || *doc.Description != description {
		t.Errorf("Description = %v, muon %q", doc.Description, description)
	}
	if doc.CategoryID == nil || *doc.CategoryID != categoryID {
		t.Errorf("CategoryID = %v, muon %q", doc.CategoryID, categoryID)
	}
	if doc.ThumbnailURL == nil || *doc.ThumbnailURL != thumbnailURL {
		t.Errorf("ThumbnailURL = %v, muon %q", doc.ThumbnailURL, thumbnailURL)
	}
	if doc.IsHidden != true {
		t.Errorf("IsHidden = %v, muon true", doc.IsHidden)
	}
	if doc.Price != "150000.00" {
		t.Errorf("Price = %q, muon %q", doc.Price, "150000.00")
	}
}

// TestToProductDocNullableRongVanLaNil kiem tra truong hop payload gui null that:
// con tro nil phai di qua van la nil de DB ghi NULL.
func TestToProductDocNullableRongVanLaNil(t *testing.T) {
	snapshot := ProductSnapshot{
		ProductID:    "11111111-1111-1111-1111-111111111111",
		Name:         "Ao thun",
		Slug:         "ao-thun",
		Description:  nil,
		Price:        "150000.00",
		ShopID:       "22222222-2222-2222-2222-222222222222",
		CategoryID:   nil,
		ThumbnailURL: nil,
		Status:       "APPROVED",
		IsHidden:     false,
		UpdatedAt:    "2026-08-01T10:20:56.789Z",
	}

	doc, err := toProductDoc(snapshot)
	if err != nil {
		t.Fatalf("khong muon loi nhung nhan: %v", err)
	}

	if doc.Description != nil {
		t.Errorf("Description = %v, muon nil", doc.Description)
	}
	if doc.CategoryID != nil {
		t.Errorf("CategoryID = %v, muon nil", doc.CategoryID)
	}
	if doc.ThumbnailURL != nil {
		t.Errorf("ThumbnailURL = %v, muon nil", doc.ThumbnailURL)
	}
}
