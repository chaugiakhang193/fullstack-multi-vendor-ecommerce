//go:build gemini_live

// Test goi Gemini THAT. Co build tag nen `go test ./...` va CI khong bao gio chay no —
// chay tay bang:
//
//	go test -tags gemini_live ./internal/bot/gemini/ -run Live -v
//
// Muc dich khac hoan toan cac test con lai: nhung test kia khoa hanh vi cua CODE, test
// nay tra loi cau hoi "ten model trong env co con ton tai va key con han muc khong" —
// thu ma httptest khong bao gio biet.
package gemini

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/bot"
)

func TestLiveGenerateStream(t *testing.T) {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		t.Skip("chua dat GEMINI_API_KEY")
	}

	client, err := New(Config{APIKey: apiKey, Model: os.Getenv("GEMINI_MODEL")})
	if err != nil {
		t.Fatalf("dung client loi: %v", err)
	}

	var chunks int
	sink := func(ev bot.Event) error {
		if ev.Kind == bot.EventText {
			chunks++
		}
		return nil
	}

	req := bot.Request{
		SystemInstruction: "Tra loi ngan gon bang tieng Viet.",
		History:           []bot.Turn{{Role: bot.RoleUser, Text: "Chao ban, ban la ai?"}},
		Stream:            true,
	}
	res, err := client.Generate(context.Background(), req, sink)
	if err != nil {
		t.Fatalf("Generate loi: %v", err)
	}

	if strings.TrimSpace(res.Text) == "" {
		t.Fatal("model tra ve chuoi rong")
	}
	if chunks == 0 {
		t.Error("khong nhan duoc manh nao qua sink — stream khong hoat dong")
	}

	// Kiem tra thuc te quan trong nhat: voi ThinkingBudget 0, so token output phai xap xi
	// do dai cau tra loi. Neu no lon bat thuong nghia la thinking token dang bi tinh vao.
	t.Logf("model=%s finish=%s prompt=%d output=%d chunks=%d text=%q",
		client.model, res.FinishReason, res.PromptTokens, res.OutputTokens, chunks, res.Text)
}
