package index

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/search-service/internal/telemetry"
)

const (
	// Chu ky quet. Phan xoa gan nhu khong quan tam con so nay: bien 24h trong nguong
	// retention da bu du cho viec GC chay tre. Thu thuc su chiu thiet khi chu ky dai
	// la DO TRE CANH BAO, vi gauge chi cap nhat khi ticker ban.
	retentionTickInterval = 1 * time.Hour

	// Tran so row xoa moi bang moi tick. Lan chay dau tien la luc nguy hiem nhat:
	// bang da tich luy tu dau du an, mot DELETE khong gioi han co the giu transaction
	// rat lau, phinh WAL, hoac timeout tren compute nho cua Neon free. 10.000/gio =
	// 240k/ngay, rut can moi ton dong thuc te trong vai ngay ma khong lan nao giu
	// transaction dai. O trang thai on dinh moi tick xoa gan nhu bang 0.
	retentionDeleteLimit = 10000

	// Nguong canh bao. KHONG phai tran dung luong - o muc nay dia van thoai mai. Day
	// la tin hieu BAT THUONG: 5.000 tombstone nghia la ~80 san pham bi xoa moi ngay
	// suot 61 ngay, chuyen khong the xay ra binh thuong o du an nay.
	tombstoneWarnThreshold = 5000

	// processed_events sinh 1 row moi event (created/updated/deleted) nen nguong phai
	// cao hon nhieu. 500.000 row ~ 45 MB, khoang 10% han muc 0.5 GB cua Neon free.
	processedEventsWarnThreshold = 500000

	// 400 MB tren han muc 0.5 GB. Day moi la canh bao dung luong that - hai nguong
	// tren chi de biet bang nao gay ra.
	dbSizeWarnThresholdBytes = 400 * 1024 * 1024
)

// RetentionGC don dinh ky hai bang chi phinh chu khong bao gio tu co lai
// (deleted_products_tombstone, processed_events), va xuat gauge de biet chung dang
// lon toi dau.
//
// Phan DEM luon chay; chi phan XOA moi bi co gac. Gac ca phan dem thi giai doan quan
// sat truoc khi bat xoa mat sach y nghia - dung luc can nhin nhat lai khong nhin duoc.
//
// retention duoc TRUYEN VAO chu khong tu tinh trong package nay: no phai bang
// MainQueueTTL + DlqTTL + bien, ma hai hang so do nam o package broker - broker da
// import index nen index import nguoc lai se thanh vong lap. main.go import ca hai
// nen ghep o do.
type RetentionGC struct {
	store     *Store
	retention time.Duration
	enabled   bool
	logger    *slog.Logger
}

// NewRetentionGC khoi tao job chua chay. Goi Run de bat dau vong doi.
func NewRetentionGC(store *Store, retention time.Duration, enabled bool, logger *slog.Logger) *RetentionGC {
	return &RetentionGC{
		store:     store,
		retention: retention,
		enabled:   enabled,
		logger:    logger,
	}
}

// Run chay vong doi toi khi ctx bi huy. Chay mot luot ngay luc khoi dong de gauge co
// gia tri that thay vi 0 cho toi tick dau tien mot gio sau.
func (r *RetentionGC) Run(ctx context.Context) {
	r.logger.Info("retention GC khoi dong",
		"chuKy", retentionTickInterval.String(),
		"giuLai", r.retention.String(),
		"xoaBat", r.enabled,
	)

	r.tick(ctx)

	ticker := time.NewTicker(retentionTickInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.tick(ctx)
		}
	}
}

// tick chay mot luot: luon cap nhat gauge, chi xoa khi co bat.
//
// Khong can co chong chay chong nhu VnpayExpirySweep ben backend: ticker cua Go khong
// the chen tick moi vao giua than vong lap dang chay, no chi lang le bo tick neu qua han.
func (r *RetentionGC) tick(ctx context.Context) {
	r.refreshGauges(ctx)
	if !r.enabled {
		return
	}
	r.deleteExpired(ctx)
}

// refreshGauges dem 2 bang + kich thuoc DB, dat gauge va canh bao khi vuot nguong.
//
// Loi luc dang tat khong dang bao: ctx bi huy cat ngang query dang chay. Mot bang loi
// khong duoc chan hai cai con lai - moi khoi tu xu ly loi cua no.
func (r *RetentionGC) refreshGauges(ctx context.Context) {
	metrics := telemetry.GetMetrics()

	tombstones, err := r.store.CountTombstones(ctx)
	if err != nil {
		if ctx.Err() == nil {
			r.logger.Warn("dem tombstone loi", "err", err)
		}
	} else {
		metrics.TombstoneRowsGauge.Set(float64(tombstones))
		if tombstones > tombstoneWarnThreshold {
			r.logger.Warn("so row tombstone vuot nguong bat thuong",
				"soRow", tombstones, "nguong", tombstoneWarnThreshold)
		}
	}

	events, err := r.store.CountProcessedEvents(ctx)
	if err != nil {
		if ctx.Err() == nil {
			r.logger.Warn("dem processed_events loi", "err", err)
		}
	} else {
		metrics.ProcessedEventsRowsGauge.Set(float64(events))
		if events > processedEventsWarnThreshold {
			r.logger.Warn("so row processed_events vuot nguong bat thuong",
				"soRow", events, "nguong", processedEventsWarnThreshold)
		}
	}

	dbSize, err := r.store.DatabaseSizeBytes(ctx)
	if err != nil {
		if ctx.Err() == nil {
			r.logger.Warn("doc kich thuoc database loi", "err", err)
		}
	} else {
		metrics.DatabaseSizeBytesGauge.Set(float64(dbSize))
		if dbSize > dbSizeWarnThresholdBytes {
			r.logger.Warn("kich thuoc database vuot nguong canh bao",
				"byte", dbSize, "nguong", dbSizeWarnThresholdBytes)
		}
	}
}

// deleteExpired xoa row qua han o ca hai bang, moi bang toi da retentionDeleteLimit row.
//
// Hai cau chay RIENG, khong chung transaction: hai bang doc lap nhau nen loi o cai nay
// khong duoc cuon nguoc cai kia.
func (r *RetentionGC) deleteExpired(ctx context.Context) {
	before := time.Now().Add(-r.retention)

	tombstones, err := r.store.DeleteExpiredTombstones(ctx, before, retentionDeleteLimit)
	if err != nil && ctx.Err() == nil {
		r.logger.Warn("xoa tombstone qua han loi", "err", err)
	}

	events, err := r.store.DeleteExpiredProcessedEvents(ctx, before, retentionDeleteLimit)
	if err != nil && ctx.Err() == nil {
		r.logger.Warn("xoa processed_events qua han loi", "err", err)
	}

	if tombstones > 0 || events > 0 {
		r.logger.Info("retention GC da xoa row qua han",
			"tombstone", tombstones,
			"processedEvents", events,
			"cuHon", before.Format(time.RFC3339),
		)
	}
}

// CountTombstones dem row trong deleted_products_tombstone de dat gauge.
func (s *Store) CountTombstones(ctx context.Context) (int64, error) {
	const q = `SELECT count(*) FROM deleted_products_tombstone`
	var count int64
	if err := s.pool.QueryRow(ctx, q).Scan(&count); err != nil {
		return 0, fmt.Errorf("dem tombstone loi: %w", err)
	}
	return count, nil
}

// CountProcessedEvents dem row trong processed_events de dat gauge.
func (s *Store) CountProcessedEvents(ctx context.Context) (int64, error) {
	const q = `SELECT count(*) FROM processed_events`
	var count int64
	if err := s.pool.QueryRow(ctx, q).Scan(&count); err != nil {
		return 0, fmt.Errorf("dem processed_events loi: %w", err)
	}
	return count, nil
}

// DatabaseSizeBytes doc kich thuoc DB#3. Chi tra metadata, khong quet bang nao.
func (s *Store) DatabaseSizeBytes(ctx context.Context) (int64, error) {
	const q = `SELECT pg_database_size(current_database())`
	var size int64
	if err := s.pool.QueryRow(ctx, q).Scan(&size); err != nil {
		return 0, fmt.Errorf("doc kich thuoc database loi: %w", err)
	}
	return size, nil
}

// DeleteExpiredTombstones xoa toi da limit row co deleted_at cu hon before.
//
// So theo deleted_at (moc NGHIEP VU, cung dong ho voi occurredAt cua event ma
// UpsertProduct dem ra so) chu KHONG theo created_at (moc ghi row) - hai moc do lech
// nhau khi event toi muon.
//
// Sub-select + LIMIT thay vi DELETE thang de dat tran so row moi lan chay.
func (s *Store) DeleteExpiredTombstones(ctx context.Context, before time.Time, limit int) (int64, error) {
	const q = `
DELETE FROM deleted_products_tombstone
WHERE product_id IN (
    SELECT product_id FROM deleted_products_tombstone
    WHERE deleted_at < $1
    ORDER BY deleted_at
    LIMIT $2
)`
	tag, err := s.pool.Exec(ctx, q, before, limit)
	if err != nil {
		return 0, fmt.Errorf("xoa tombstone qua han loi: %w", err)
	}
	return tag.RowsAffected(), nil
}

// DeleteExpiredProcessedEvents xoa toi da limit row co created_at cu hon before.
// Bang nay chi co mot moc thoi gian nen khong co lua chon nao khac.
func (s *Store) DeleteExpiredProcessedEvents(ctx context.Context, before time.Time, limit int) (int64, error) {
	const q = `
DELETE FROM processed_events
WHERE event_id IN (
    SELECT event_id FROM processed_events
    WHERE created_at < $1
    ORDER BY created_at
    LIMIT $2
)`
	tag, err := s.pool.Exec(ctx, q, before, limit)
	if err != nil {
		return 0, fmt.Errorf("xoa processed_events qua han loi: %w", err)
	}
	return tag.RowsAffected(), nil
}
