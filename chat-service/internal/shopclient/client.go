// Package shopclient tra loi dung mot cau hoi: nguoi dung nay so huu shop nao.
//
// chat-service khong co bang shop (database-per-service), nen cau tra loi phai di xin monolith.
// Endpoint duoc goi la GET /api/v1/seller/shops - endpoint san co cua monolith, gac bang
// @Roles(SELLER), tra ve shop cua chinh nguoi cam token. Khong them endpoint internal moi.
package shopclient

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	// lookupTimeout: monolith tren Render acc#1 duoc giu am 24/7 nen khong co cold start ~50s
	// nhu search-service. 5s du cho mot lan goi binh thuong ke ca khi cham.
	lookupTimeout = 5 * time.Second

	// cacheTTL: quan he seller-shop gan nhu khong bao gio doi. 10 phut du de mot phien lam viec
	// cua seller chi ton mot lan goi, va van ngan de mot seller vua duoc duyet shop khong phai
	// doi qua lau.
	cacheTTL = 10 * time.Minute

	// sellerShopsPath la endpoint co san cua monolith, gac @Roles(SELLER).
	sellerShopsPath = "/api/v1/seller/shops"
)

// Client hoi monolith xem mot seller so huu shop nao, co cache theo user.
type Client struct {
	baseURL string
	http    *http.Client

	mu      sync.RWMutex
	entries map[string]cacheEntry
}

type cacheEntry struct {
	shopID    string
	expiresAt time.Time
}

// New dung client. baseURL rong thi ShopIDFor luon tra chuoi rong, khong loi: chay local ma
// chua bat monolith thi phan buyer van dung duoc, chi rieng inbox seller la trong.
func New(baseURL string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		http:    &http.Client{Timeout: lookupTimeout},
		entries: make(map[string]cacheEntry),
	}
}

// ShopIDFor tra ve id shop ma nguoi cam token nay so huu, hoac chuoi rong neu ho khong co shop.
//
// Khong tra loi khi nguoi dung khong co shop: "khong so huu shop nao" la mot cau tra loi hop le
// (buyer thuong), khong phai su co. Chi loi mang/loi doc moi tra error.
//
// Cache theo userID chu khong theo token: token doi moi lan refresh, cache theo no thi ty le
// trung gan bang khong.
func (c *Client) ShopIDFor(ctx context.Context, userID, bearerToken string) (string, error) {
	if c.baseURL == "" {
		return "", nil
	}

	if shopID, ok := c.recall(userID); ok {
		return shopID, nil
	}

	endpoint := c.baseURL + sellerShopsPath
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", fmt.Errorf("dung request hoi shop loi: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+bearerToken)

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("goi monolith hoi shop loi: %w", err)
	}
	defer resp.Body.Close()

	// 401/403 = khong phai seller. 404 = la seller nhung chua tao shop. Ca ba deu la "khong co
	// shop", khong phai loi, va deu duoc cache de mot buyer duyet inbox khong goi monolith moi lan.
	if resp.StatusCode == http.StatusUnauthorized ||
		resp.StatusCode == http.StatusForbidden ||
		resp.StatusCode == http.StatusNotFound {
		c.remember(userID, "")
		return "", nil
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("monolith tra %d khi hoi shop", resp.StatusCode)
	}

	// Monolith boc moi response trong envelope {message, data} qua TransformInterceptor.
	var body struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", fmt.Errorf("doc ket qua hoi shop loi: %w", err)
	}

	c.remember(userID, body.Data.ID)
	return body.Data.ID, nil
}

// recall doc cache, bao ca "co ban ghi con han" hay khong.
func (c *Client) recall(userID string) (string, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	entry, ok := c.entries[userID]
	if !ok || time.Now().After(entry.expiresAt) {
		return "", false
	}
	return entry.shopID, true
}

// remember ghi cache. Ghi ca gia tri rong: "nguoi nay khong co shop" cung dang duoc nho.
func (c *Client) remember(userID, shopID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[userID] = cacheEntry{shopID: shopID, expiresAt: time.Now().Add(cacheTTL)}
}

// Seed nap san mot cap user-shop vao cache.
//
// Ton tai cho TEST: dung mot monolith gia chi de tra ve mot chuoi la dung ba chuc dong cho mot
// su that khong co gi de kiem chung. Khong co duong nao goi no tu code chay that.
//
// Chi co tac dung khi client duoc dung voi baseURL khac rong: ShopIDFor tra ve som truoc khi hoi
// cache neu baseURL rong.
func (c *Client) Seed(userID, shopID string) {
	c.remember(userID, shopID)
}
