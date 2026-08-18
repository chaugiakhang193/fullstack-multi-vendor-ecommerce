package bot

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

// scriptedClient la Client gia ghi lai request nhan duoc va tra ket qua da lap san. Khac
// fakeClient cua breaker/retry o hai cho: no tra duoc ToolCalls, va no GIU LAI request de
// test soi hinh dang lich su gui len o vong 2.
type scriptedClient struct {
	mu       sync.Mutex
	script   []scriptedTurn
	requests []Request
	calls    int
}

type scriptedTurn struct {
	result Result
	err    error
	// emit la cac Event day qua sink truoc khi tra ve.
	emit []Event
}

func newScriptedClient(script ...scriptedTurn) *scriptedClient {
	return &scriptedClient{script: script}
}

func (c *scriptedClient) Generate(ctx context.Context, req Request, sink Sink) (Result, error) {
	c.mu.Lock()
	index := c.calls
	c.calls++
	c.requests = append(c.requests, req)
	if index >= len(c.script) {
		index = len(c.script) - 1
	}
	turn := c.script[index]
	c.mu.Unlock()

	for _, ev := range turn.emit {
		if sink != nil {
			if err := sink(ev); err != nil {
				return Result{}, err
			}
		}
	}
	return turn.result, turn.err
}

func (c *scriptedClient) requestAt(t *testing.T, i int) Request {
	t.Helper()
	c.mu.Lock()
	defer c.mu.Unlock()
	if i >= len(c.requests) {
		t.Fatalf("moi co %d request, khong co request thu %d", len(c.requests), i)
	}
	return c.requests[i]
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// newTestTool dung SearchTool tro vao mot search-service gia luon tra dung mot san pham.
func newTestTool(t *testing.T) *SearchTool {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"items":[{"productId":"p1","name":"Dien thoai A","slug":"dien-thoai-a","price":4990000}],"total":1}`)
	}))
	t.Cleanup(server.Close)
	return NewSearchTool(server.URL, testFrontendURL)
}

// Duong chinh: model xin tool o vong 1, Service chay tool roi hoi lai o vong 2.
func TestAskChayVongToolRoiHoiLai(t *testing.T) {
	call := ToolCall{Name: ToolSearchProducts, Args: map[string]any{"query": "dien thoai"}}
	client := newScriptedClient(
		scriptedTurn{
			result: Result{ToolCalls: []ToolCall{call}},
			emit:   []Event{{Kind: EventToolCall, ToolCall: &call}},
		},
		scriptedTurn{
			result: Result{Text: "Minh tim duoc 1 san pham."},
			emit:   []Event{{Kind: EventText, Text: "Minh tim duoc 1 san pham."}},
		},
	)

	var events []Event
	sink := func(ev Event) error {
		events = append(events, ev)
		return nil
	}

	svc := NewService(client, newTestTool(t), testLogger())
	res, err := svc.Ask(context.Background(), "co dien thoai nao khong", nil, sink)
	if err != nil {
		t.Fatalf("Ask loi: %v", err)
	}

	if client.calls != 2 {
		t.Fatalf("so lan goi model = %d, muon 2 (mot vong quyet dinh + mot vong sinh chu)", client.calls)
	}
	if res.Text != "Minh tim duoc 1 san pham." {
		t.Errorf("Text = %q", res.Text)
	}

	// Vong 2 phai stream, vong 1 thi khong.
	if client.requestAt(t, 0).Stream {
		t.Error("vong 1 khong duoc stream")
	}
	if !client.requestAt(t, 1).Stream {
		t.Error("vong 2 phai stream")
	}

	// Bay 3: lich su vong 2 phai ket thuc bang ToolCall roi toi ToolResult, dung thu tu do.
	history := client.requestAt(t, 1).History
	if len(history) < 3 {
		t.Fatalf("lich su vong 2 co %d luot, muon it nhat 3", len(history))
	}
	toolCallTurn := history[len(history)-2]
	toolResultTurn := history[len(history)-1]
	if toolCallTurn.Role != RoleModel || toolCallTurn.ToolCall == nil {
		t.Errorf("luot ap chot phai la ToolCall cua model, nhan %+v", toolCallTurn)
	}
	if toolResultTurn.Role != RoleUser || toolResultTurn.ToolResult == nil {
		t.Errorf("luot cuoi phai la ToolResult cua user, nhan %+v", toolResultTurn)
	}
	if toolResultTurn.ToolResult.Payload["products"] == nil {
		t.Error("ToolResult khong mang ket qua san pham")
	}
}

// Model khong xin tool (cau chao hoi): khong duoc goi model lan hai, va chu cua vong 1 phai
// di ra sink.
func TestAskKhongGoiToolThiKhongHoiLanHai(t *testing.T) {
	client := newScriptedClient(scriptedTurn{result: Result{Text: "Chao ban!"}})

	var events []Event
	sink := func(ev Event) error {
		events = append(events, ev)
		return nil
	}

	svc := NewService(client, newTestTool(t), testLogger())
	res, err := svc.Ask(context.Background(), "chao", nil, sink)
	if err != nil {
		t.Fatalf("Ask loi: %v", err)
	}

	if client.calls != 1 {
		t.Fatalf("so lan goi model = %d, muon 1", client.calls)
	}
	if res.Text != "Chao ban!" {
		t.Errorf("Text = %q", res.Text)
	}
	if len(events) != 1 || events[0].Text != "Chao ban!" {
		t.Fatalf("muon dung mot event mang cau tra loi, nhan %+v", events)
	}
}

// Chu cua vong 1 KHONG duoc lot ra sink khi model co goi tool: vong 2 se noi lai doan do.
func TestAskChanChuCuaVongMotKhiCoGoiTool(t *testing.T) {
	call := ToolCall{Name: ToolSearchProducts, Args: map[string]any{"query": "dien thoai"}}
	client := newScriptedClient(
		scriptedTurn{
			result: Result{Text: "De minh tim thu...", ToolCalls: []ToolCall{call}},
			emit: []Event{
				{Kind: EventText, Text: "De minh tim thu..."},
				{Kind: EventToolCall, ToolCall: &call},
			},
		},
		scriptedTurn{
			result: Result{Text: "Day la ket qua."},
			emit:   []Event{{Kind: EventText, Text: "Day la ket qua."}},
		},
	)

	var events []Event
	sink := func(ev Event) error {
		events = append(events, ev)
		return nil
	}

	svc := NewService(client, newTestTool(t), testLogger())
	if _, err := svc.Ask(context.Background(), "co dien thoai nao khong", nil, sink); err != nil {
		t.Fatalf("Ask loi: %v", err)
	}

	for _, ev := range events {
		if ev.Kind == EventText && ev.Text == "De minh tim thu..." {
			t.Fatal("chu cua vong 1 lot ra sink")
		}
	}
	// Su kien ToolCall thi PHAI qua duoc: tang SSE dua vao no de bao trang thai.
	var sawToolCall bool
	for _, ev := range events {
		if ev.Kind == EventToolCall {
			sawToolCall = true
		}
	}
	if !sawToolCall {
		t.Error("su kien ToolCall bi chan mat, tang SSE se khong bao duoc trang thai")
	}
}

// Model goi mot tool khong ton tai: van phai tra ve payload cho no, neu khong vong hoi thoai
// dut giua chung.
func TestAskTraPayloadLoiKhiToolKhongCoThat(t *testing.T) {
	call := ToolCall{Name: "delete_everything", Args: map[string]any{}}
	client := newScriptedClient(
		scriptedTurn{result: Result{ToolCalls: []ToolCall{call}}},
		scriptedTurn{result: Result{Text: "Minh chua tra cuu duoc."}},
	)

	svc := NewService(client, newTestTool(t), testLogger())
	if _, err := svc.Ask(context.Background(), "xoa het di", nil, nil); err != nil {
		t.Fatalf("Ask loi: %v", err)
	}

	history := client.requestAt(t, 1).History
	last := history[len(history)-1]
	if last.ToolResult == nil {
		t.Fatal("khong co ToolResult trong lich su vong 2")
	}
	if last.ToolResult.Payload["error"] == nil {
		t.Error("payload phai co truong error khi tool khong co that")
	}
}

// Thieu SEARCH_SERVICE_URL: Service dung voi tool nil, khong duoc dang ky tool len model va
// khong duoc panic.
func TestAskKhongDangKyToolKhiThieuSearchService(t *testing.T) {
	client := newScriptedClient(scriptedTurn{result: Result{Text: "Chao ban!"}})

	svc := NewService(client, nil, testLogger())
	if _, err := svc.Ask(context.Background(), "chao", nil, nil); err != nil {
		t.Fatalf("Ask loi: %v", err)
	}

	if tools := client.requestAt(t, 0).Tools; len(tools) != 0 {
		t.Errorf("da dang ky %d tool trong khi khong co search-service", len(tools))
	}
}

// Loi o vong 1 phai lan thang len tren, khong duoc nuot roi goi tiep vong 2.
func TestAskTraLoiKhiVongMotHong(t *testing.T) {
	client := newScriptedClient(scriptedTurn{err: ErrCircuitOpen})

	svc := NewService(client, newTestTool(t), testLogger())
	_, err := svc.Ask(context.Background(), "chao", nil, nil)
	if !errors.Is(err, ErrCircuitOpen) {
		t.Fatalf("loi = %v, muon ErrCircuitOpen", err)
	}
	if client.calls != 1 {
		t.Errorf("so lan goi model = %d, muon 1 (khong duoc chay tiep vong 2)", client.calls)
	}
}

// Lich su dai hon 6 luot phai bi cat, va mang goc cua ben goi khong duoc sua.
func TestAskCatLichSuConSauLuot(t *testing.T) {
	client := newScriptedClient(scriptedTurn{result: Result{Text: "ok"}})

	history := make([]Turn, 0, 10)
	for i := 0; i < 10; i++ {
		history = append(history, Turn{Role: RoleUser, Text: "cu"})
	}

	svc := NewService(client, newTestTool(t), testLogger())
	if _, err := svc.Ask(context.Background(), "moi", history, nil); err != nil {
		t.Fatalf("Ask loi: %v", err)
	}

	sent := client.requestAt(t, 0).History
	// 6 luot cu gan nhat + 1 cau hoi vua gui.
	if len(sent) != maxHistoryTurns+1 {
		t.Fatalf("so luot gui len = %d, muon %d", len(sent), maxHistoryTurns+1)
	}
	if sent[len(sent)-1].Text != "moi" {
		t.Errorf("luot cuoi = %q, muon cau hoi vua gui", sent[len(sent)-1].Text)
	}
	if len(history) != 10 {
		t.Errorf("mang lich su cua ben goi bi sua: len = %d", len(history))
	}
}
