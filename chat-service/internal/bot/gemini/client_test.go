package gemini

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"google.golang.org/genai"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/bot"
)

// newTestClient dung Client tro vao mot httptest.Server thay cho Gemini that. Toan bo
// test trong file nay khong goi API that va khong can API key that.
func newTestClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()

	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	client, err := New(Config{APIKey: "test-key", Model: "gemini-test", BaseURL: server.URL})
	if err != nil {
		t.Fatalf("dung client loi: %v", err)
	}
	return client
}

// sseChunk boc mot JSON body thanh mot su kien SSE dung dinh dang Gemini tra ve.
func sseChunk(body string) string {
	return "data: " + body + "\n\n"
}

// textChunk sinh mot chunk chi co chu.
func textChunk(text string) string {
	return sseChunk(fmt.Sprintf(`{"candidates":[{"content":{"role":"model","parts":[{"text":%q}]}}]}`, text))
}

// collectSink gom cac Event ma client day ra.
type collectSink struct {
	events []bot.Event
}

func (c *collectSink) sink(ev bot.Event) error {
	c.events = append(c.events, ev)
	return nil
}

func TestGenerateStreamGhepChuVaDayTungManh(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, textChunk("Xin chao"))
		_, _ = io.WriteString(w, textChunk(" ban"))
		_, _ = io.WriteString(w, sseChunk(`{"candidates":[{"content":{"role":"model","parts":[{"text":"!"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":11,"candidatesTokenCount":7}}`))
	})

	var sink collectSink
	req := bot.Request{
		History: []bot.Turn{{Role: bot.RoleUser, Text: "chao"}},
		Stream:  true,
	}
	res, err := client.Generate(context.Background(), req, sink.sink)
	if err != nil {
		t.Fatalf("Generate loi: %v", err)
	}

	if got, want := res.Text, "Xin chao ban!"; got != want {
		t.Errorf("Text = %q, muon %q", got, want)
	}
	if len(sink.events) != 3 {
		t.Fatalf("so event = %d, muon 3 (moi chunk mot event)", len(sink.events))
	}
	if got, want := sink.events[0].Text, "Xin chao"; got != want {
		t.Errorf("event dau = %q, muon %q", got, want)
	}
	if res.FinishReason != "STOP" {
		t.Errorf("FinishReason = %q, muon STOP", res.FinishReason)
	}
	if res.PromptTokens != 11 || res.OutputTokens != 7 {
		t.Errorf("tokens = %d/%d, muon 11/7", res.PromptTokens, res.OutputTokens)
	}
	if res.Truncated {
		t.Error("Truncated = true nhung finishReason la STOP")
	}
}

// Test quan trong nhat cua file nay: muc suy nghi phai that su nam trong request body.
// Dat sai o day thi khong co loi nao bao — chi la token bay vao phan suy nghi va cau tra
// loi bi cat ngang.
//
// Kiem ca viec KHONG con gui thinkingBudget: dong Gemini 3 tra 400 INVALID_ARGUMENT khi
// thay truong do, va httptest thi nhan moi thu nen chi test nay chan duoc no quay lai.
func TestGenerateGuiThinkingLevelToiThieuVaCapOutput(t *testing.T) {
	var captured struct {
		GenerationConfig struct {
			MaxOutputTokens int `json:"maxOutputTokens"`
			ThinkingConfig  *struct {
				ThinkingLevel  string `json:"thinkingLevel"`
				ThinkingBudget *int   `json:"thinkingBudget"`
			} `json:"thinkingConfig"`
		} `json:"generationConfig"`
	}

	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &captured); err != nil {
			t.Errorf("doc request body loi: %v — body=%s", err, body)
		}
		_, _ = io.WriteString(w, textChunk("ok"))
	})

	req := bot.Request{History: []bot.Turn{{Role: bot.RoleUser, Text: "chao"}}, Stream: true}
	if _, err := client.Generate(context.Background(), req, nil); err != nil {
		t.Fatalf("Generate loi: %v", err)
	}

	if captured.GenerationConfig.ThinkingConfig == nil {
		t.Fatal("request khong co thinkingConfig")
	}
	if got := captured.GenerationConfig.ThinkingConfig.ThinkingLevel; got != string(genai.ThinkingLevelMinimal) {
		t.Errorf("thinkingLevel = %q, muon %q — de trong la model tu chon muc suy nghi", got, genai.ThinkingLevelMinimal)
	}
	if budget := captured.GenerationConfig.ThinkingConfig.ThinkingBudget; budget != nil {
		t.Errorf("thinkingBudget = %d nhung dong Gemini 3 tu choi truong nay bang 400", *budget)
	}
	if got := captured.GenerationConfig.MaxOutputTokens; got != maxOutputTokens {
		t.Errorf("maxOutputTokens = %d, muon %d", got, maxOutputTokens)
	}
}

func TestGenerateDay429ThanhErrRateLimited(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = io.WriteString(w, `{"error":{"code":429,"message":"quota het","status":"RESOURCE_EXHAUSTED"}}`)
	})

	req := bot.Request{History: []bot.Turn{{Role: bot.RoleUser, Text: "chao"}}, Stream: true}
	_, err := client.Generate(context.Background(), req, nil)
	if !errors.Is(err, bot.ErrRateLimited) {
		t.Fatalf("loi = %v, muon ErrRateLimited", err)
	}
}

func TestGenerateDay5xxThanhErrUpstreamVa4xxThanhErrBadRequest(t *testing.T) {
	cases := []struct {
		name   string
		status int
		body   string
		want   error
	}{
		{
			"503 thanh upstream", http.StatusServiceUnavailable,
			`{"error":{"code":503,"message":"qua tai","status":"UNAVAILABLE"}}`, bot.ErrUpstream,
		},
		{
			"500 thanh upstream", http.StatusInternalServerError,
			`{"error":{"code":500,"message":"loi trong","status":"INTERNAL"}}`, bot.ErrUpstream,
		},
		{
			"400 thanh bad request", http.StatusBadRequest,
			`{"error":{"code":400,"message":"tham so sai","status":"INVALID_ARGUMENT"}}`, bot.ErrBadRequest,
		},
		{
			"403 key sai thanh bad request", http.StatusForbidden,
			`{"error":{"code":403,"message":"key khong hop le","status":"PERMISSION_DENIED"}}`, bot.ErrBadRequest,
		},
		// Body khong phai JSON (vd trang loi HTML cua proxy dung truoc Gemini): luc nay
		// SDK moi lay HTTP status lam Code.
		{"502 body HTML thanh upstream", http.StatusBadGateway, `<html>bad gateway</html>`, bot.ErrUpstream},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = io.WriteString(w, tc.body)
			})

			req := bot.Request{History: []bot.Turn{{Role: bot.RoleUser, Text: "chao"}}, Stream: true}
			_, err := client.Generate(context.Background(), req, nil)
			if !errors.Is(err, tc.want) {
				t.Fatalf("loi = %v, muon %v", err, tc.want)
			}
		})
	}
}

// APIError.Code duoc doc tu BODY chu khong phai tu HTTP status: mot loi tra ve JSON ma
// thieu truong "code" se co Code == 0. Neu chi xet Code thi lan 429 kieu nay bi xep
// nham thanh loi server roi duoc retry — dot them mot lan vao han muc da can.
func TestGenerateDay429ThieuCodeThanhErrRateLimitedNhoStatus(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = io.WriteString(w, `{"error":{"message":"quota het","status":"RESOURCE_EXHAUSTED"}}`)
	})

	req := bot.Request{History: []bot.Turn{{Role: bot.RoleUser, Text: "chao"}}, Stream: true}
	_, err := client.Generate(context.Background(), req, nil)
	if !errors.Is(err, bot.ErrRateLimited) {
		t.Fatalf("loi = %v, muon ErrRateLimited", err)
	}
}

// Chot rang retry san co cua SDK da tat that. Mac dinh cua no la 5 lan thu va co ca 429
// trong danh sach retry — neu mot ban SDK sau doi mac dinh hoac minh lo xoa RetryOptions,
// test nay do truoc khi quota that bi dot.
func TestGenerateKhongDungRetrySanCoCuaSDK(t *testing.T) {
	var calls atomic.Int32

	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = io.WriteString(w, `{"error":{"message":"sap"}}`)
	})

	req := bot.Request{History: []bot.Turn{{Role: bot.RoleUser, Text: "chao"}}, Stream: true}
	if _, err := client.Generate(context.Background(), req, nil); err == nil {
		t.Fatal("muon loi nhung Generate thanh cong")
	}

	if got := calls.Load(); got != 1 {
		t.Fatalf("so lan goi server = %d, muon 1 — retry cua SDK chua duoc tat", got)
	}
}

func TestGenerateDayToolCallRaEvent(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, sseChunk(`{"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"search_products","args":{"query":"dien thoai","maxPrice":5000000}}}]},"finishReason":"STOP"}]}`))
	})

	var sink collectSink
	req := bot.Request{
		History: []bot.Turn{{Role: bot.RoleUser, Text: "co dien thoai nao duoi 5 trieu khong"}},
		Tools: []bot.ToolSpec{{
			Name:        "search_products",
			Description: "tim san pham",
			ParametersJSONSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"query": map[string]any{"type": "string"}},
				"required":   []string{"query"},
			},
		}},
		Stream: true,
	}
	res, err := client.Generate(context.Background(), req, sink.sink)
	if err != nil {
		t.Fatalf("Generate loi: %v", err)
	}

	if len(res.ToolCalls) != 1 {
		t.Fatalf("so tool call = %d, muon 1", len(res.ToolCalls))
	}
	if res.ToolCalls[0].Name != "search_products" {
		t.Errorf("ten tool = %q", res.ToolCalls[0].Name)
	}
	if got := res.ToolCalls[0].Args["query"]; got != "dien thoai" {
		t.Errorf("args query = %v", got)
	}
	if len(sink.events) != 1 || sink.events[0].Kind != bot.EventToolCall {
		t.Fatalf("muon dung mot event kieu EventToolCall, nhan %+v", sink.events)
	}
}

func TestGenerateBoQuaPhanThought(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, sseChunk(`{"candidates":[{"content":{"role":"model","parts":[{"text":"nghi rieng","thought":true},{"text":"cau tra loi"}]},"finishReason":"STOP"}]}`))
	})

	var sink collectSink
	req := bot.Request{History: []bot.Turn{{Role: bot.RoleUser, Text: "chao"}}, Stream: true}
	res, err := client.Generate(context.Background(), req, sink.sink)
	if err != nil {
		t.Fatalf("Generate loi: %v", err)
	}

	if res.Text != "cau tra loi" {
		t.Errorf("Text = %q, muon %q — phan thought khong duoc lot ra ngoai", res.Text, "cau tra loi")
	}
	if len(sink.events) != 1 {
		t.Errorf("so event = %d, muon 1", len(sink.events))
	}
}

func TestGenerateBaoTruncatedKhiChamTranToken(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, sseChunk(`{"candidates":[{"content":{"role":"model","parts":[{"text":"dai qua"}]},"finishReason":"MAX_TOKENS"}]}`))
	})

	req := bot.Request{History: []bot.Turn{{Role: bot.RoleUser, Text: "chao"}}, Stream: true}
	res, err := client.Generate(context.Background(), req, nil)
	if err != nil {
		t.Fatalf("Generate loi: %v", err)
	}
	if !res.Truncated {
		t.Error("Truncated = false nhung finishReason la MAX_TOKENS")
	}
}

func TestGenerateDayFinishReasonAnToanThanhErrBlocked(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, sseChunk(`{"candidates":[{"finishReason":"SAFETY"}]}`))
	})

	req := bot.Request{History: []bot.Turn{{Role: bot.RoleUser, Text: "chao"}}, Stream: true}
	_, err := client.Generate(context.Background(), req, nil)
	if !errors.Is(err, bot.ErrBlocked) {
		t.Fatalf("loi = %v, muon ErrBlocked", err)
	}
}

func TestGenerateKhongStreamDungGenerateContent(t *testing.T) {
	var path string
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"candidates":[{"content":{"role":"model","parts":[{"text":"tra loi mot phat"}]},"finishReason":"STOP"}]}`)
	})

	req := bot.Request{History: []bot.Turn{{Role: bot.RoleUser, Text: "chao"}}, Stream: false}
	res, err := client.Generate(context.Background(), req, nil)
	if err != nil {
		t.Fatalf("Generate loi: %v", err)
	}
	if res.Text != "tra loi mot phat" {
		t.Errorf("Text = %q", res.Text)
	}
	if strings.Contains(path, "streamGenerateContent") {
		t.Errorf("Stream=false nhung van goi %s", path)
	}
}

func TestGenerateGuiLichSuCoToolCallVaToolResult(t *testing.T) {
	var captured struct {
		Contents []struct {
			Role  string `json:"role"`
			Parts []struct {
				Text         string          `json:"text"`
				FunctionCall json.RawMessage `json:"functionCall"`
				FunctionResp json.RawMessage `json:"functionResponse"`
			} `json:"parts"`
		} `json:"contents"`
	}

	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &captured); err != nil {
			t.Errorf("doc request body loi: %v", err)
		}
		_, _ = io.WriteString(w, textChunk("xong"))
	})

	req := bot.Request{
		History: []bot.Turn{
			{Role: bot.RoleUser, Text: "co dien thoai nao khong"},
			{Role: bot.RoleModel, ToolCall: &bot.ToolCall{
				Name: "search_products",
				Args: map[string]any{"query": "dien thoai"},
			}},
			{Role: bot.RoleUser, ToolResult: &bot.ToolResult{
				Name:    "search_products",
				Payload: map[string]any{"items": []any{}},
			}},
		},
		Stream: true,
	}
	if _, err := client.Generate(context.Background(), req, nil); err != nil {
		t.Fatalf("Generate loi: %v", err)
	}

	if len(captured.Contents) != 3 {
		t.Fatalf("so content = %d, muon 3", len(captured.Contents))
	}
	if captured.Contents[0].Parts[0].Text == "" {
		t.Error("luot 1 mat phan text")
	}
	if captured.Contents[1].Role != "model" || len(captured.Contents[1].Parts[0].FunctionCall) == 0 {
		t.Errorf("luot 2 phai la functionCall cua model, nhan %+v", captured.Contents[1])
	}
	if captured.Contents[2].Role != "user" || len(captured.Contents[2].Parts[0].FunctionResp) == 0 {
		t.Errorf("luot 3 phai la functionResponse cua user, nhan %+v", captured.Contents[2])
	}
}

// Chu ky phai di tron vong: doc ra tu response cua vong 1, gui lai o lich su vong 2.
// Ca hai dau deu khong co test nao khac cham toi, ma httptest thi nhan moi request nen
// mat chu ky se khong lam do bat ky test nao khac — chi Gemini that tra 400.
func TestGenerateDocDuocThoughtSignatureCuaToolCall(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, sseChunk(`{"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"search_products","args":{"query":"dien thoai"}},"thoughtSignature":"Y2h1LWt5LWdpYQ=="}]},"finishReason":"STOP"}]}`))
	})

	req := bot.Request{History: []bot.Turn{{Role: bot.RoleUser, Text: "tim dien thoai"}}, Stream: true}
	res, err := client.Generate(context.Background(), req, nil)
	if err != nil {
		t.Fatalf("Generate loi: %v", err)
	}

	if len(res.ToolCalls) != 1 {
		t.Fatalf("so tool call = %d, muon 1", len(res.ToolCalls))
	}
	if got := string(res.ToolCalls[0].Signature); got != "chu-ky-gia" {
		t.Errorf("Signature = %q, muon %q", got, "chu-ky-gia")
	}
}

func TestGenerateGuiLaiThoughtSignatureOLichSu(t *testing.T) {
	var captured struct {
		Contents []struct {
			Parts []struct {
				ThoughtSignature []byte `json:"thoughtSignature"`
			} `json:"parts"`
		} `json:"contents"`
	}

	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &captured); err != nil {
			t.Errorf("doc request body loi: %v", err)
		}
		_, _ = io.WriteString(w, textChunk("xong"))
	})

	req := bot.Request{
		History: []bot.Turn{
			{Role: bot.RoleUser, Text: "co dien thoai nao khong"},
			{Role: bot.RoleModel, ToolCall: &bot.ToolCall{
				Name:      "search_products",
				Args:      map[string]any{"query": "dien thoai"},
				Signature: []byte("chu-ky-gia"),
			}},
			{Role: bot.RoleUser, ToolResult: &bot.ToolResult{
				Name:    "search_products",
				Payload: map[string]any{"items": []any{}},
			}},
		},
		Stream: true,
	}
	if _, err := client.Generate(context.Background(), req, nil); err != nil {
		t.Fatalf("Generate loi: %v", err)
	}

	if len(captured.Contents) != 3 {
		t.Fatalf("so content = %d, muon 3", len(captured.Contents))
	}
	if got := string(captured.Contents[1].Parts[0].ThoughtSignature); got != "chu-ky-gia" {
		t.Errorf("thoughtSignature gui len = %q, muon %q", got, "chu-ky-gia")
	}
}

func TestNewTraLoiKhiThieuAPIKey(t *testing.T) {
	if _, err := New(Config{APIKey: ""}); err == nil {
		t.Fatal("muon loi khi thieu API key")
	}
}
