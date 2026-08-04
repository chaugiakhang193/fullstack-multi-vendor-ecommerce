package index

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ProductDoc la du lieu 1 document ghi vao product_index, da chuan hoa tu
// ProductSnapshot (broker) — updatedAt da parse sang time.Time. Tach struct rieng o
// tang index de broker khong lo chi tiet cot DB.
type ProductDoc struct {
	ProductID    string
	Name         string
	Slug         string
	Description  *string
	Price        string
	ShopID       string
	CategoryID   *string
	ThumbnailURL *string
	Status       string
	IsHidden     bool
	UpdatedAt    time.Time
}

// Store boc pgxpool + cac thao tac len index. Dung tu consumer.
type Store struct {
	pool *pgxpool.Pool
}

// ErrDuplicateEvent bao event da xu ly truoc do (processed_events trung). Consumer bat
// loi nay de ack + skip, KHONG coi la loi transient (khong redeliver).
var ErrDuplicateEvent = errors.New("event da xu ly truoc do")

// NewStore mo pool toi Neon roi Ping ngay de fail-fast neu URL/SSL sai (thay vi chet
// luc ghi message dau tien). ctx la context khoi dong co timeout, khong phai ctx vong doi.
func NewStore(ctx context.Context, databaseURL string) (*Store, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("mo pgx pool loi: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping DB loi: %w", err)
	}
	return &Store{pool: pool}, nil
}

// Close dong pool khi service shutdown. Goi SAU khi consumer da dung (main dam bao
// bang wg.Wait truoc khi defer nay chay).
func (s *Store) Close() {
	s.pool.Close()
}

// markProcessed chen event_id vao processed_events trong tx. Tra ErrDuplicateEvent khi
// trung (Postgres 23505) — nghia la 1 delivery khac da xu ly event nay. Chen dedup NAM
// TRONG cung transaction voi upsert/delete de "da ghi index" va "da danh dau processed"
// nguyen tu voi nhau: rollback thi ca hai cung mat, khong bao gio lech.
func markProcessed(ctx context.Context, tx pgx.Tx, eventID string) error {
	const q = `INSERT INTO processed_events (event_id) VALUES ($1)`
	if _, err := tx.Exec(ctx, q, eventID); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrDuplicateEvent
		}
		return fmt.Errorf("insert processed_events loi: %w", err)
	}
	return nil
}

// UpsertProduct ghi/cap nhat 1 document trong 1 transaction: dedup (processed_events)
// truoc, roi UPSERT co dieu kien ordering. Tra ErrDuplicateEvent neu event da xu ly.
//
// ON CONFLICT (product_id) DO UPDATE ... WHERE product_index.updated_at < EXCLUDED.updated_at:
// BO QUA event cu hon. RabbitMQ khong bao dam thu tu va relay co retry, nen 1 product.updated
// cu hoan toan co the toi SAU ban moi — dieu kien WHERE khi do false → khong ghi de, giu ban
// moi. Nhanh INSERT (chua co row) khong bi WHERE chi phoi nen luon chen. search_vector khong
// dung toi o day, de NULL cho trigger populate sau.
func (s *Store) UpsertProduct(ctx context.Context, eventID string, doc ProductDoc) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("mo transaction loi: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := markProcessed(ctx, tx, eventID); err != nil {
		return err
	}

	const q = `
INSERT INTO product_index (
    product_id, name, slug, description, price, shop_id,
    category_id, thumbnail_url, status, is_hidden, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
ON CONFLICT (product_id) DO UPDATE SET
    name          = EXCLUDED.name,
    slug          = EXCLUDED.slug,
    description   = EXCLUDED.description,
    price         = EXCLUDED.price,
    shop_id       = EXCLUDED.shop_id,
    category_id   = EXCLUDED.category_id,
    thumbnail_url = EXCLUDED.thumbnail_url,
    status        = EXCLUDED.status,
    is_hidden     = EXCLUDED.is_hidden,
    updated_at    = EXCLUDED.updated_at,
    indexed_at    = now()
WHERE product_index.updated_at < EXCLUDED.updated_at`

	productID := doc.ProductID
	name := doc.Name
	slug := doc.Slug
	description := doc.Description
	price := doc.Price
	shopID := doc.ShopID
	categoryID := doc.CategoryID
	thumbnailURL := doc.ThumbnailURL
	status := doc.Status
	isHidden := doc.IsHidden
	updatedAt := doc.UpdatedAt

	_, err = tx.Exec(ctx, q,
		productID, name, slug, description, price, shopID,
		categoryID, thumbnailURL, status, isHidden, updatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert product_index loi: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit loi: %w", err)
	}
	return nil
}

// DeleteProduct xoa document khoi index trong 1 transaction, co dedup. product.deleted
// khong mang timestamp nen khong so ordering — xoa thang. Gioi han da biet: 1 product.updated
// cu (emit truoc delete) toi sau delete se re-insert (hoi sinh row). Chap nhan vi thuc te
// monolith khong sua product da xoa; chong hoi sinh de xu ly sau neu can. Xoa ban ghi khong
// ton tai khong loi (DELETE 0 row) — van danh dau processed de khong xu ly lai.
func (s *Store) DeleteProduct(ctx context.Context, eventID string, productID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("mo transaction loi: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := markProcessed(ctx, tx, eventID); err != nil {
		return err
	}

	const q = `DELETE FROM product_index WHERE product_id = $1`
	if _, err := tx.Exec(ctx, q, productID); err != nil {
		return fmt.Errorf("delete product_index loi: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit loi: %w", err)
	}
	return nil
}
