package httpapi

import (
	"log/slog"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/auth"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/shopclient"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/store"
)

// ChatDeps la phu thuoc cua nhanh chat 1-1.
//
// Tach khoi BotDeps chu khong nhoi them truong vao do: hai nhanh khong dung chung mot thu nao
// ngoai Verifier va Logger. Gop lai thi moi test cua handler bot phai dung them shopclient ma no
// khong bao gio goi toi.
type ChatDeps struct {
	Store    *store.Store
	Shops    *shopclient.Client
	Verifier *auth.Verifier
	Logger   *slog.Logger
}
