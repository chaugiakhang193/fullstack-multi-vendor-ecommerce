package quota

import (
	"math"
	"sync"
	"time"
)

const (
	// DefaultBurstCapacity so cau duoc bam lien tuc truoc khi phai cho. 10 la rat rong cho mot
	// nguoi that - han muc ngay cua khach chi co 5 - va rat chat cho mot vong lap.
	DefaultBurstCapacity = 10

	// DefaultBurstRefill: mot luot moi 6 giay, tuc 10 cau/phut khi da tieu het bo dem.
	DefaultBurstRefill = 6 * time.Second

	// burstSweepEvery: cu bay nhieu lan Allow thi don bucket ngu mot lan. Don theo NHIP GOI chu
	// khong bang goroutine ticker rieng: mot goroutine la mot thu nua phai tat dung cach luc
	// shutdown, va map chi phinh khi co request.
	burstSweepEvery = 256
)

// Burst la tran theo TOC DO cua mot subject, giu hoan toan trong bo nho.
//
// Vi sao can no khi da co Limiter:
//
//   - Acquire dem bang DB nen moi lan hoi la mot lenh ghi. Chan mot vong lap bang no nghia la
//     vong lap do van ghi DB moi vong, dung cai ta muon tranh.
//   - Reserve (dung cho nhanh cache) khong dem gi ca. No chan duoc hai request chong len nhau,
//     nhung mot vong lap tuan tu di qua het vi moi request da nha co truoc khi request sau vao.
//
// Burst dung TRUOC ca hai va tra loi bang mot phep tinh trong RAM, nen request bi chan khong
// cham DB mot lenh nao.
//
// Dem theo subject.dayKey() - cung khoa voi co dang-chay va bo dem ngay. Mot nguoi la mot khoa o
// moi tang; dung khoa rieng o day thi co hai dinh nghia "mot nguoi" trong cung mot handler va
// cai nao sai se khong lo ra.
type Burst struct {
	capacity int
	refill   time.Duration

	// now tach thanh truong de test tua thoi gian toi ma khong phai ngu that.
	now func() time.Time

	mu      sync.Mutex
	buckets map[string]*burstBucket
	calls   int
}

// burstBucket la mot gao token. tokens la so thuc chu khong phai so nguyen de phan nap lai khong
// bi lam tron ve 0 khi hai request cach nhau ngan hon mot chu ky refill.
type burstBucket struct {
	tokens   float64
	lastSeen time.Time
}

// NewBurst dung mot cong toc do rong.
func NewBurst(capacity int, refill time.Duration) *Burst {
	return &Burst{
		capacity: capacity,
		refill:   refill,
		now:      time.Now,
		buckets:  make(map[string]*burstBucket),
	}
}

// Allow tieu mot token cua subject, hoac tu choi neu gao da can.
//
// Tra ve Decision giong Acquire va Reserve de handler dung chung mot khoi ghi loi.
func (b *Burst) Allow(subj Subject) Decision {
	key := subj.dayKey()
	now := b.now()

	b.mu.Lock()
	defer b.mu.Unlock()

	b.maybeSweepLocked(now)

	bucket, ok := b.buckets[key]
	if !ok {
		// Nguoi moi bat dau voi gao day: cua nay de chan vong lap, khong phai de bat nguoi hoi
		// cau dau tien phai cho.
		bucket = &burstBucket{tokens: float64(b.capacity)}
		b.buckets[key] = bucket
	} else {
		earned := float64(now.Sub(bucket.lastSeen)) / float64(b.refill)
		bucket.tokens = math.Min(float64(b.capacity), bucket.tokens+earned)
	}
	bucket.lastSeen = now

	if bucket.tokens < 1 {
		// Cho dung bang phan token con thieu chu khong phai mot hang so: bam som mot chut thi
		// cho it, bam lien tuc thi cho du mot chu ky.
		missing := 1 - bucket.tokens
		return deny(ReasonBurst, time.Duration(missing*float64(b.refill)))
	}

	bucket.tokens--
	return Decision{Allowed: true, Reason: ReasonOK}
}

// Len tra ve so bucket dang giu, dung cho test va cho log.
func (b *Burst) Len() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.buckets)
}

// maybeSweepLocked don cac bucket da ngu du lau. Ben goi phai dang giu b.mu.
func (b *Burst) maybeSweepLocked(now time.Time) {
	b.calls++
	if b.calls < burstSweepEvery {
		return
	}
	b.calls = 0

	ttl := b.idleTTL()
	for key, bucket := range b.buckets {
		if now.Sub(bucket.lastSeen) > ttl {
			delete(b.buckets, key)
		}
	}
}

// idleTTL la moc sau do mot bucket chac chan da day lai.
//
// capacity * refill la thoi gian nap day gao tu con so 0. Qua moc do thi bucket cu va bucket moi
// tinh khong phan biet duoc nua, nen xoa di khong mat gi - day khong phai mot phep danh doi giua
// bo nho va do chinh xac.
func (b *Burst) idleTTL() time.Duration {
	return b.refill * time.Duration(b.capacity)
}
