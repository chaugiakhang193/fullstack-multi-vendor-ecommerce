package bot

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"sync"
	"time"
	"unicode"
)

const (
	// DefaultReplyCacheTTL: 10 phut du de nuot mot tran bam F5, va du ngan de gia hay ton kho
	// trong cau tra loi khong kip cu di dang ke.
	DefaultReplyCacheTTL = 10 * time.Minute

	// DefaultReplyCacheMaxEntries chan bo nho. Moi entry vai KB nen 500 entry la vai MB - vua
	// voi 512MB RAM cua Render free.
	DefaultReplyCacheMaxEntries = 500
)

// ReplyCache nho cau tra loi cua bot theo cau hoi da chuan hoa.
//
// Dung chung cho MOI nguoi dung: cau hoi ve san pham khong mang thong tin ca nhan va cau tra
// loi khong phu thuoc ai hoi. Nho vay mot cau pho bien chi ton mot lan goi Gemini cho ca chuc
// nguoi hoi trong cung 10 phut.
type ReplyCache struct {
	ttl time.Duration
	max int

	// now tach thanh truong de test tua thoi gian toi ma khong phai ngu that.
	now func() time.Time

	mu      sync.Mutex
	entries map[string]replyEntry
}

type replyEntry struct {
	text      string
	expiresAt time.Time
}

// NewReplyCache dung cache rong.
func NewReplyCache(ttl time.Duration, max int) *ReplyCache {
	return &ReplyCache{
		ttl:     ttl,
		max:     max,
		now:     time.Now,
		entries: make(map[string]replyEntry),
	}
}

// TTL tra ve thoi han song cua mot entry, dung cho log luc khoi dong.
func (c *ReplyCache) TTL() time.Duration {
	return c.ttl
}

// Get tra ve cau tra loi da luu cho cau hoi nay, neu con han.
//
// Dung moc expiresAt tinh la HET HAN (khong Before nghia la bang hoac qua moc): mot entry song
// dung 10 phut chu khong phai 10 phut cong mot khoanh khac.
func (c *ReplyCache) Get(question string) (string, bool) {
	key := cacheKey(question)

	c.mu.Lock()
	defer c.mu.Unlock()

	entry, ok := c.entries[key]
	if !ok {
		return "", false
	}
	if !c.now().Before(entry.expiresAt) {
		// Xoa ngay luc doc trung entry het han: khong can job quet rieng cho cac entry hay duoc
		// hoi lai.
		delete(c.entries, key)
		return "", false
	}
	return entry.text, true
}

// Put luu mot cau tra loi. Chuoi rong bi bo qua - cache mot cau tra loi rong nghia la nhan ban
// su co do cho moi nguoi trong suot TTL.
func (c *ReplyCache) Put(question, answer string) {
	if answer == "" {
		return
	}
	key := cacheKey(question)

	c.mu.Lock()
	defer c.mu.Unlock()

	if len(c.entries) >= c.max {
		c.sweepExpiredLocked()
	}
	// Quet xong van day thi BO QUA lan luu nay thay vi duoi mot entry ngau nhien: cache day
	// nghia la dang co rat nhieu cau hoi khac nhau, tuc la cache gan nhu khong con tac dung -
	// luc do gia tri cua no khong bu duoc do phuc tap cua mot chinh sach duoi entry.
	if len(c.entries) >= c.max {
		return
	}

	c.entries[key] = replyEntry{text: answer, expiresAt: c.now().Add(c.ttl)}
}

// Len tra ve so entry dang giu, dung cho test va cho log.
func (c *ReplyCache) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.entries)
}

// sweepExpiredLocked xoa cac entry het han. Ben goi phai dang giu c.mu.
//
// Quet luc GHI chu khong bang goroutine ticker rieng: cache nay be, va mot goroutine nen la mot
// thu nua phai tat dung cach luc shutdown.
func (c *ReplyCache) sweepExpiredLocked() {
	now := c.now()
	for key, entry := range c.entries {
		if !now.Before(entry.expiresAt) {
			delete(c.entries, key)
		}
	}
}

// cacheKey bam cau hoi da chuan hoa thanh khoa.
//
// Bam thay vi de nguyen van lam khoa: nguyen van cau nguoi dung nam trong map la thu se roi vao
// heap dump hoac dong log luc debug. Bam cung chan luon cau hoi dai bat thuong lam phinh khoa.
func cacheKey(question string) string {
	sum := sha256.Sum256([]byte(normalizeQuestion(question)))
	return hex.EncodeToString(sum[:])
}

// normalizeQuestion gom cac bien the go tay cua cung mot cau ve mot dang: thuong hoa, gop moi
// chuoi khoang trang thanh mot dau cach, cat hai dau.
//
// KHONG bo dau tieng Viet: hai cau chi khac dau la hai cau khac nghia, gop chung vao mot khoa la
// tra loi sai cho mot trong hai.
func normalizeQuestion(question string) string {
	lowered := strings.ToLower(strings.TrimSpace(question))

	var builder strings.Builder
	builder.Grow(len(lowered))
	lastWasSpace := false
	for _, r := range lowered {
		if unicode.IsSpace(r) {
			// Nhieu dau cach lien tiep (hoac tab, xuong dong khi dan tu cho khac) gop thanh mot.
			if !lastWasSpace {
				builder.WriteRune(' ')
				lastWasSpace = true
			}
			continue
		}
		builder.WriteRune(r)
		lastWasSpace = false
	}
	return strings.TrimSpace(builder.String())
}
