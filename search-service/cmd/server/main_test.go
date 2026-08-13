package main

import (
	"testing"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/search-service/internal/broker"
)

// TestRetentionWindowRa61Ngay chot ket qua cu the cua cong thuc voi TTL dang cau hinh.
//
// Test nay ton tai vi mot ly do rat hep: bat loi don vi. Hai tham so vao la MILI-giay
// con time.Duration dem NANO-giay, nen thieu mot phep nhan la ket qua sai 1.000.000 lan
// - ma van bien dich, van chay, van in ra chuoi co don vi gio trong log.
func TestRetentionWindowRa61Ngay(t *testing.T) {
	got := retentionWindow(broker.MainQueueTTL, broker.DlqTTL)
	want := 61 * 24 * time.Hour

	if got != want {
		t.Errorf("retentionWindow = %v, muon %v", got, want)
	}
}

// TestRetentionWindowPhuHetTuoiMessageToiDa chot BAT BIEN an toan, khong phai con so.
//
// Khac test tren o cho: test tren se do neu ai doi TTL (du doi dung), con test nay chi
// do khi bat bien that su bi pha. Giu ca hai vi chung bat hai loai loi khac nhau - doi
// nham gia tri, va doi dung gia tri nhung lam thung nguyen tac.
func TestRetentionWindowPhuHetTuoiMessageToiDa(t *testing.T) {
	got := retentionWindow(broker.MainQueueTTL, broker.DlqTTL)

	// Tuoi toi da mot message co the dat truoc khi duoc xu ly: nam het TTL o queue
	// chinh, dead-letter sang DLQ va dong ho chay lai tu dau, nam het TTL o do.
	tuoiMessageToiDa := time.Duration(broker.MainQueueTTL+broker.DlqTTL) * time.Millisecond

	if got <= tuoiMessageToiDa {
		t.Errorf(
			"retentionWindow = %v, khong lon hon tuoi message toi da %v - tombstone se bi xoa trong khi van con message co the toi va hoi sinh san pham da xoa",
			got, tuoiMessageToiDa,
		)
	}
}

// TestRetentionWindowDoiTheoTTL chot rang nguong duoc SUY RA chu khong hardcode.
//
// Neu ai do sau nay thay cong thuc bang mot hang so 61 ngay, test nay do ngay - va do
// dung cai bay ma ca thiet ke nay dung de tranh: doi TTL o broker ma nguong GC dung im.
func TestRetentionWindowDoiTheoTTL(t *testing.T) {
	motNgayMs := int64(24 * 60 * 60 * 1000)

	got := retentionWindow(motNgayMs, motNgayMs)
	want := 3 * 24 * time.Hour // 1 + 1 ngay TTL + 1 ngay bien

	if got != want {
		t.Errorf("retentionWindow(1 ngay, 1 ngay) = %v, muon %v", got, want)
	}
}
