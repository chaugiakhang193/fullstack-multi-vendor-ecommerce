package config

import (
	"strings"
	"testing"
)

// Han muc la van chan tien: sai cau hinh o day thi hoac bot tu choi moi nguoi, hoac khong con
// gi chan quota Gemini. Nhanh "gõ sai thi khong khoi dong" duoc tuyen bo trong commit 442
// nhung luc do chua co test nao chung minh - day la cho tra no do.
func TestPositiveIntEnv(t *testing.T) {
	const key = "BOT_TEST_LIMIT"

	cases := []struct {
		name    string
		raw     string
		want    int32
		wantErr bool
	}{
		{name: "khong dat thi lay mac dinh", raw: "", want: 7},
		{name: "so hop le", raw: "42", want: 42},
		// Chu O thay so 0: loi go phim that, va la ly do chinh de fail-fast thay vi im lang roi
		// ve mac dinh.
		{name: "chu O thay so khong", raw: "3OO", wantErr: true},
		{name: "so 0", raw: "0", wantErr: true},
		{name: "so am", raw: "-5", wantErr: true},
		// Vuot int32. Neu dung strconv.Atoi roi ep kieu thi gia tri nay quan thanh SO AM va
		// service khoi dong binh thuong voi han muc am - bot tu choi tat ca ma log van sach.
		{name: "vuot int32", raw: "3000000000", wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.raw != "" {
				t.Setenv(key, tc.raw)
			}

			got, err := positiveIntEnv(key, 7)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("mong doi loi cho %q, nhung tra ve %d", tc.raw, got)
				}
				// Thong bao loi phai goi ten bien, neu khong nguoi deploy co 4 bien de doan.
				if !strings.Contains(err.Error(), key) {
					t.Errorf("thong bao loi khong nhac ten bien: %q", err.Error())
				}
				return
			}
			if err != nil {
				t.Fatalf("khong mong doi loi: %v", err)
			}
			if got != tc.want {
				t.Errorf("gia tri = %d, mong doi %d", got, tc.want)
			}
		})
	}
}

func TestLoadLayHanMucMacDinh(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/chat?sslmode=disable")
	t.Setenv("JWT_ACCESS_SECRET", "secret-test")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load loi: %v", err)
	}

	if cfg.BotGuestDailyLimit != defaultBotGuestDailyLimit {
		t.Errorf("guestDaily = %d, mong doi %d", cfg.BotGuestDailyLimit, defaultBotGuestDailyLimit)
	}
	if cfg.BotUserDailyLimit != defaultBotUserDailyLimit {
		t.Errorf("userDaily = %d, mong doi %d", cfg.BotUserDailyLimit, defaultBotUserDailyLimit)
	}
	if cfg.BotUserHourlyLimit != defaultBotUserHourlyLimit {
		t.Errorf("userHourly = %d, mong doi %d", cfg.BotUserHourlyLimit, defaultBotUserHourlyLimit)
	}
	if cfg.BotGlobalDailyLimit != defaultBotGlobalDailyLimit {
		t.Errorf("globalDaily = %d, mong doi %d", cfg.BotGlobalDailyLimit, defaultBotGlobalDailyLimit)
	}
}

// Test nay kiem duong day tu env toi Load, khong phai kiem rieng helper: mot lan quen goi
// positiveIntEnv cho mot bien nao do se lot qua TestPositiveIntEnv nhung bi bat o day.
func TestLoadTuChoiKhiHanMucHong(t *testing.T) {
	keys := []string{
		"BOT_GUEST_DAILY_LIMIT",
		"BOT_USER_DAILY_LIMIT",
		"BOT_USER_HOURLY_LIMIT",
		"BOT_DAILY_GLOBAL_LIMIT",
		"BOT_BURST_CAPACITY",
		"BOT_BURST_REFILL_SECONDS",
	}

	for _, key := range keys {
		t.Run(key, func(t *testing.T) {
			t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/chat?sslmode=disable")
			t.Setenv("JWT_ACCESS_SECRET", "secret-test")
			t.Setenv(key, "3OO")

			_, err := Load()
			if err == nil {
				t.Fatalf("%s hong ma Load van thanh cong - bien nay chua di qua positiveIntEnv", key)
			}
			if !strings.Contains(err.Error(), key) {
				t.Errorf("loi khong nhac ten bien hong: %q", err.Error())
			}
		})
	}
}
