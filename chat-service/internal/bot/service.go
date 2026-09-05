package bot

import (
	"context"
	"log/slog"
	"time"
)

const (
	// answerBudget la tran cho ca mot cau tra loi, ke ca vong hoi tool lan lan goi tool.
	// Rong hon TotalBudget cua mot lan goi provider vi mot cau tra loi co the gom hai lan
	// goi model cong mot lan goi search-service.
	//
	// Phan con lai sau vong 1 va tool phai du cho vong 2 chay tron mot chu ky cat-va-thu-lai
	// nhu vong 1, chu khong phai chi la phan thua. Dat sat hon thi vong 2 kip cat roi chet
	// truoc khi lan thu lai kip chay - dung kieu hong ma decideBudget ben duoi mo ta.
	answerBudget = 56 * time.Second

	// decideBudget la tran cho vong 1. Vong nay con kiem nhiem viec tra loi cac cau khong
	// lien quan san pham (chao hoi, huong dan), nen tran phai du cho mot cau tra loi hoan
	// chinh chu khong chi du cho mot quyet dinh goi tool.
	//
	// Tran phai chua tron HAI lan goi provider: firstChunkTimeout ben adapter cat lan dau,
	// Retrier ngu mot nhip, roi lan thu hai can nguyen mot cua so nua. Ha xuong duoi tong
	// do thi lan thu hai bi cat khi vua chay duoc vai tram mili giay - mat cho thu lai ma
	// van tra tien cho no. Do tre cua Gemini gan nhu toan bo la cho xep hang truoc token
	// dau chu khong phai sinh chu, nen thu lai la cach duy nhat nuot duoc cai duoi dai.
	decideBudget = 18 * time.Second

	// Chi gui 6 luot gan nhat len model. Moi subject chi co mot conversation voi bot va no
	// song mai, nen phai cat o tang doc; khong cat thi prompt dai them mai.
	maxHistoryTurns = 6
)

// Service chay vong function calling: hoi model, chay tool neu model xin, roi hoi lai de
// model noi thanh cau.
//
// Tach khoi Client vi Client la single-shot. Nho vay retry, breaker va timeout ben duoi chi
// phai dung cho mot lan goi, va test cua chung khong dinh toi khai niem tool.
type Service struct {
	client Client
	tool   *SearchTool
	logger *slog.Logger
}

// NewService dung tang dieu phoi. tool duoc phep nil: thieu SEARCH_SERVICE_URL thi bot van
// tra loi duoc cac cau khong can tra cuu san pham.
func NewService(client Client, tool *SearchTool, logger *slog.Logger) *Service {
	return &Service{client: client, tool: tool, logger: logger}
}

// Ask tra loi mot cau hoi. history la cac luot truoc cau hoi nay (cu nhat dung dau), question
// la cau vua gui. Chu duoc day dan qua sink.
func (s *Service) Ask(ctx context.Context, question string, history []Turn, sink Sink) (Result, error) {
	ctx, cancel := context.WithTimeout(ctx, answerBudget)
	defer cancel()

	turns := append(trimHistory(history), Turn{Role: RoleUser, Text: question})

	first := Request{
		SystemInstruction: SystemPrompt,
		History:           turns,
		Stream:            false,
	}
	if s.tool != nil {
		first.Tools = []ToolSpec{SearchToolSpec()}
	}

	// Vong 1 chi day ra su kien ToolCall de tang tren bien no thanh mot dong trang thai cho
	// nguoi dung. Chu cua vong 1 bi chan lai: neu model vua noi vua goi tool thi doan noi do
	// se bi vong 2 noi lai.
	decideCtx, cancelDecide := context.WithTimeout(ctx, decideBudget)
	decided, err := s.client.Generate(decideCtx, first, toolCallOnly(sink))
	cancelDecide()
	if err != nil {
		return decided, err
	}

	// Model khong xin tool: cau tra loi da xong ngay o vong 1. Day mot lan qua sink roi dung.
	// Goi model lan nua chi de co stream la tra tien gap doi cho cung mot cau.
	if len(decided.ToolCalls) == 0 {
		if sink != nil && decided.Text != "" {
			if err := sink(Event{Kind: EventText, Text: decided.Text}); err != nil {
				return decided, err
			}
		}
		return decided, nil
	}

	// Chi chay mot tool moi cau hoi. Model co the xin nhieu lan goi trong mot luot, chay het
	// chung thi mot cau hoi don co the dot nhieu lan quota search.
	call := decided.ToolCalls[0]
	payload := s.runTool(ctx, call)

	// Thu tu hai luot nay la bat buoc: Gemini tu choi ca request neu functionResponse khong
	// di ngay sau functionCall tuong ung.
	turns = append(turns,
		Turn{Role: RoleModel, ToolCall: &call},
		Turn{Role: RoleUser, ToolResult: &ToolResult{Name: call.Name, Payload: payload}},
	)

	second := Request{
		SystemInstruction: SystemPrompt,
		History:           turns,
		Tools:             first.Tools,
		Stream:            true,
	}
	return s.client.Generate(ctx, second, sink)
}

// runTool chay tool model vua xin. Ten khong khop thi van tra ve mot payload chu khong bo
// qua: model dang cho ket qua cho dung function call do.
func (s *Service) runTool(ctx context.Context, call ToolCall) map[string]any {
	if s.tool == nil || call.Name != ToolSearchProducts {
		s.logger.Warn("model goi tool khong co that", "tool", call.Name)
		return toolError("cong cu nay hien khong dung duoc")
	}

	start := time.Now()
	payload, diagnostic := s.tool.Execute(ctx, call.Args)

	// Khong log call.Args: no chua nguyen van cau nguoi dung go.
	//
	// hasError mot minh khong phan biet duoc cac kieu hong: 5xx tu edge, 200 voi body khong
	// doc duoc, va mot cu tu choi o tang ket noi deu chi ra "hasError:true" giong het nhau.
	// outcome va statusCode la cho ghi lai su khac biet do.
	//
	// hasError van giu: mot cua so dieu tra bat qua nhieu ngay se doc duoc ca log cu (chi co
	// hasError) lan log moi (co them outcome) ma khong phai doi truy van giua chung.
	s.logger.Info("chay tool",
		append([]any{
			"tool", call.Name,
			"latencyMs", time.Since(start).Milliseconds(),
			"hasError", payload["error"] != nil,
			"outcome", string(diagnostic.Outcome),
			"statusCode", diagnostic.StatusCode,
		}, diagnostic.Edge.logAttrs()...)...,
	)
	return payload
}

// toolCallOnly loc sink cho vong 1: chi cho su kien ToolCall di qua.
func toolCallOnly(sink Sink) Sink {
	if sink == nil {
		return nil
	}
	return func(ev Event) error {
		if ev.Kind != EventToolCall {
			return nil
		}
		return sink(ev)
	}
}

// trimHistory giu lai toi da maxHistoryTurns luot gan nhat. Luon tra ve slice moi de lan
// append sau khong ghi de len mang cua ben goi.
func trimHistory(history []Turn) []Turn {
	if len(history) <= maxHistoryTurns {
		return append([]Turn(nil), history...)
	}
	return append([]Turn(nil), history[len(history)-maxHistoryTurns:]...)
}
