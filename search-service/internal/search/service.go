package search

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/search-service/internal/search/searchdb"
)

// Gioi han phan trang: chan limit qua lon (bao ve DB) va chuan hoa dau vao.
const (
	defaultLimit = 20
	// maxLimit 300: monolith two-stage lay top-K candidate mot lan roi tu phan trang lai,
	// nen page size noi bo lon hon cap public cu (100). 300 uuid trong IN(...) van nhe.
	maxLimit = 300

	// maxDetailedItems la tran so san pham /search/detailed tra ve. Day la nut chan cao
	// catalog qua bot: bot chi nhin duoc 5 dong moi cau hoi du index co bao nhieu hang.
	maxDetailedItems = 5

	// nameMaxRunes cat ten san pham cho ngan. Dem theo RUNE chu khong theo byte: mot chu
	// tieng Viet co dau chiem 2-3 byte, cat theo byte se xe doi ky tu thanh rac UTF-8.
	nameMaxRunes = 120
)

// ErrEmptyQuery bao thieu tu khoa. Handler map sang 400.
var ErrEmptyQuery = errors.New("query rong")

// Request la dau vao da chuan hoa cho mot lan search. price la string (so da validate
// o handler) de cast ::numeric chinh xac; nil = khong loc. categoryIDs rong = khong loc.
type Request struct {
	Query       string
	Page        int
	Limit       int
	MinPrice    *string
	MaxPrice    *string
	ShopID      *string
	CategoryIDs []string
}

// Item la 1 ket qua: id + diem lien quan. Monolith se hydrate tu id nay.
type Item struct {
	ProductID string  `json:"productId"`
	Rank      float32 `json:"rank"`
}

// Result gom items trang hien tai + tong so khop (de FE tinh so trang).
type Result struct {
	Items []Item `json:"items"`
	Total int64  `json:"total"`
	Page  int    `json:"page"`
	Limit int    `json:"limit"`
}

// Service boc sqlc Queries tren pool dung chung voi store ghi. Giu them pool de mo
// transaction rieng cho nhanh trigram (can SET LOCAL nguong word_similarity).
type Service struct {
	q    *searchdb.Queries
	pool *pgxpool.Pool
}

// NewService nhan pool (tu index.Store.Pool()) - dung chung, khong mo pool moi.
func NewService(pool *pgxpool.Pool) *Service {
	return &Service{q: searchdb.New(pool), pool: pool}
}

// toNumeric doi *string sang pgtype.Numeric cho param nullable cua sqlc. Chu y: override
// numeric->string trong sqlc.yaml chi ap cho cot khong nullable; param sqlc.narg(...)::numeric
// nullable nen sqlc sinh ra pgtype.Numeric, phai boc tay. nil hoac chuoi khong parse duoc
// -> Valid=false (NULL) = bo qua filter gia (dong bo cach numericParam o handler xu ly).
func toNumeric(s *string) pgtype.Numeric {
	var n pgtype.Numeric
	if s == nil {
		return n
	}
	if err := n.Scan(*s); err != nil {
		return pgtype.Numeric{}
	}
	return n
}

// toUUID doi *string sang pgtype.UUID cho param nullable shop_id (ly do giong toNumeric).
// nil hoac chuoi khong phai uuid hop le -> Valid=false (NULL) = bo qua filter shop.
func toUUID(s *string) pgtype.UUID {
	var u pgtype.UUID
	if s == nil {
		return u
	}
	if err := u.Scan(*s); err != nil {
		return pgtype.UUID{}
	}
	return u
}

// Search chay 2 query: dem tong + lay trang. Tra ErrEmptyQuery neu thieu tu khoa.
func (s *Service) Search(ctx context.Context, req Request) (Result, error) {
	if req.Query == "" {
		return Result{}, ErrEmptyQuery
	}

	page := req.Page
	if page < 1 {
		page = 1
	}
	limit := req.Limit
	if limit < 1 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}
	offset := (page - 1) * limit

	total, err := s.q.CountSearchProducts(ctx, searchdb.CountSearchProductsParams{
		Query:       req.Query,
		MinPrice:    toNumeric(req.MinPrice),
		MaxPrice:    toNumeric(req.MaxPrice),
		ShopID:      toUUID(req.ShopID),
		CategoryIds: req.CategoryIDs,
	})
	if err != nil {
		return Result{}, fmt.Errorf("dem ket qua search loi: %w", err)
	}

	// FTS khong khop lexeme nao -> thu trigram fuzzy/partial (recall backstop). Chi chay khi
	// can nen khong dung ranking FTS cho truong hop khop tu nguyen ven; bo luon query search
	// FTS ben duoi vi chac chan cung rong.
	if total == 0 {
		return s.searchTrgm(ctx, req, page, limit, offset)
	}

	rows, err := s.q.SearchProducts(ctx, searchdb.SearchProductsParams{
		Query:       req.Query,
		MinPrice:    toNumeric(req.MinPrice),
		MaxPrice:    toNumeric(req.MaxPrice),
		ShopID:      toUUID(req.ShopID),
		CategoryIds: req.CategoryIDs,
		PageLimit:   int32(limit),
		PageOffset:  int32(offset),
	})
	if err != nil {
		return Result{}, fmt.Errorf("query search loi: %w", err)
	}

	items := make([]Item, 0, len(rows))
	for _, r := range rows {
		items = append(items, Item{ProductID: r.ProductID, Rank: r.Rank})
	}

	return Result{Items: items, Total: total, Page: page, Limit: limit}, nil
}

// searchTrgm chay nhanh trigram trong 1 transaction de SET LOCAL nguong word_similarity
// (0.6 mac dinh qua chat, "die" truot). Transaction chi de doi GUC pham vi cuc bo - cac query
// van la doc-only. Params y het FTS (cung bo loc gia/shop/category).
func (s *Service) searchTrgm(
	ctx context.Context,
	req Request,
	page, limit, offset int,
) (Result, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Result{}, fmt.Errorf("mo tx trigram loi: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL pg_trgm.word_similarity_threshold = 0.3"); err != nil {
		return Result{}, fmt.Errorf("set nguong trigram loi: %w", err)
	}
	qtx := s.q.WithTx(tx)

	total, err := qtx.CountSearchProductsTrgm(ctx, searchdb.CountSearchProductsTrgmParams{
		Query:       req.Query,
		MinPrice:    toNumeric(req.MinPrice),
		MaxPrice:    toNumeric(req.MaxPrice),
		ShopID:      toUUID(req.ShopID),
		CategoryIds: req.CategoryIDs,
	})
	if err != nil {
		return Result{}, fmt.Errorf("dem ket qua trigram loi: %w", err)
	}

	rows, err := qtx.SearchProductsTrgm(ctx, searchdb.SearchProductsTrgmParams{
		Query:       req.Query,
		MinPrice:    toNumeric(req.MinPrice),
		MaxPrice:    toNumeric(req.MaxPrice),
		ShopID:      toUUID(req.ShopID),
		CategoryIds: req.CategoryIDs,
		PageLimit:   int32(limit),
		PageOffset:  int32(offset),
	})
	if err != nil {
		return Result{}, fmt.Errorf("query trigram loi: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return Result{}, fmt.Errorf("commit tx trigram loi: %w", err)
	}

	items := make([]Item, 0, len(rows))
	for _, r := range rows {
		items = append(items, Item{ProductID: r.ProductID, Rank: r.Rank})
	}
	return Result{Items: items, Total: total, Page: page, Limit: limit}, nil
}

// DetailedItem la mot san pham du field de noi thanh cau.
//
// KHONG co description: mo ta do seller viet, la van ban khong tin duoc va la duong prompt
// injection thang vao context cua model. KHONG co ten shop: product_index khong luu no, va
// payload outbox ben monolith cung khong mang no — them duoc thi phai sua ca ba cho.
type DetailedItem struct {
	ProductID string `json:"productId"`
	Name      string `json:"name"`
	Slug      string `json:"slug"`
	Price     int64  `json:"price"`
}

// DetailedResult la ket qua cua /search/detailed. Total la tong so khop THAT trong index
// chu khong phai so phan tu tra ve, de ben goi noi duoc "co 30 san pham, day la 5 cai dau".
type DetailedResult struct {
	Items []DetailedItem `json:"items"`
	Total int64          `json:"total"`
}

// SearchDetailed chay dung Search() dang phuc vu prod roi hydrate field hien thi cho nhung
// id lay duoc. Hai query DB nhung MOT lan goi HTTP: ben goi la chat-service, ma search-service
// ngu sau 15' idle nen moi round-trip them deu la mot lan nua co the dinh cold-start.
func (s *Service) SearchDetailed(ctx context.Context, req Request) (DetailedResult, error) {
	// Ep phan trang: endpoint nay khong nhan page/limit tu ben ngoai, cap la co dinh.
	req.Page = 1
	req.Limit = maxDetailedItems

	ranked, err := s.Search(ctx, req)
	if err != nil {
		return DetailedResult{}, err
	}
	// Items khoi tao rong chu khong de nil: JSON cua nil slice la null, ben Go doc lai thanh
	// mang rong thi khong sao nhung ai curl bang tay se tuong endpoint hong.
	if len(ranked.Items) == 0 {
		return DetailedResult{Items: []DetailedItem{}, Total: ranked.Total}, nil
	}

	ids := make([]string, 0, len(ranked.Items))
	for _, candidate := range ranked.Items {
		ids = append(ids, candidate.ProductID)
	}

	rows, err := s.q.GetProductsByIDs(ctx, ids)
	if err != nil {
		return DetailedResult{}, fmt.Errorf("lay chi tiet san pham loi: %w", err)
	}

	// Danh chi muc theo id de ghep lai dung THU TU XEP HANG cua Search(). ANY(...) tra ve
	// theo thu tu Postgres chon, khong theo thu tu mang truyen vao — giu nguyen thu tu do
	// thi san pham khop nhat co the roi xuong cuoi, ma cap chi co 5 dong.
	byID := make(map[string]searchdb.GetProductsByIDsRow, len(rows))
	for _, row := range rows {
		byID[row.ProductID] = row
	}

	items := make([]DetailedItem, 0, len(ranked.Items))
	for _, candidate := range ranked.Items {
		row, ok := byID[candidate.ProductID]
		if !ok {
			// San pham bien mat giua hai query (vua bi an hoac xoa). Bo qua mot dong con
			// hon hong ca cau tra loi.
			continue
		}
		items = append(items, DetailedItem{
			ProductID: row.ProductID,
			Name:      sanitizeName(row.Name),
			Slug:      row.Slug,
			Price:     row.Price,
		})
	}

	return DetailedResult{Items: items, Total: ranked.Total}, nil
}

// sanitizeName don ten san pham truoc khi no roi khoi service. Ten do seller nhap nen phai
// coi la van ban khong tin duoc theo hai huong: ky tu dieu khien co the be gay khoi JSON ma
// model doc, con ten dai bat thuong la mot cach nhet chi thi vao context.
func sanitizeName(name string) string {
	// unicode.IsControl bat ca NUL lan ESC — nhung thu strings.Fields ben duoi khong
	// dong toi vi chung khong phai khoang trang.
	cleaned := strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, name)

	// Gop moi cum khoang trang ve mot dau cach, bo khoang trang hai dau.
	cleaned = strings.Join(strings.Fields(cleaned), " ")

	runes := []rune(cleaned)
	if len(runes) > nameMaxRunes {
		return string(runes[:nameMaxRunes])
	}
	return cleaned
}

