package bot

import "errors"

// Cac loi chuan cua tang bot. Adapter cua tung provider co nhiem vu doi loi rieng cua
// SDK thanh dung mot trong nhung loi nay; breaker va retry chi lam viec voi chung, nen
// hai lop do khong biet gi ve Gemini va dung lai duoc neu sau nay doi provider.
var (
	// ErrRateLimited: provider tu choi vi cham han muc (HTTP 429). Khac ErrUpstream o
	// cho thu lai KHONG bao gio giup, chi ton them mot lan dem quota.
	ErrRateLimited = errors.New("bot: provider tu choi vi cham han muc")

	// ErrUpstream: provider hong phia server (5xx) hoac loi mang. Thu lai co the giup.
	ErrUpstream = errors.New("bot: provider loi phia server")

	// ErrTimeout: provider khong tra loi kip han.
	ErrTimeout = errors.New("bot: provider khong tra loi kip han")

	// ErrBadRequest: loi do dau vao cua chinh minh (4xx khong phai 429) — prompt sai,
	// khai bao tool sai, API key sai. Khong tinh vao bo dem breaker vi provider van khoe.
	ErrBadRequest = errors.New("bot: yeu cau gui len provider khong hop le")

	// ErrBlocked: bo loc an toan chan noi dung. Cung khong tinh la loi cua provider.
	ErrBlocked = errors.New("bot: noi dung bi bo loc an toan chan")

	// ErrCircuitOpen: breaker dang mo nen khong goi provider. Tang tren bat loi nay de
	// tra ve duong lui (ket qua search) thay vi bao loi chung chung.
	ErrCircuitOpen = errors.New("bot: circuit breaker dang mo")
)
