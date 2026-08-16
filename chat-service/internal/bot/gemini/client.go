// Package gemini la adapter tu bot.Client sang SDK google.golang.org/genai. No chi lam
// mot viec: doi kieu qua lai va doi loi cua SDK thanh loi chuan cua package bot. Retry,
// circuit breaker, quota deu nam o tang tren va khong biet gi ve Gemini.
package gemini

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"google.golang.org/genai"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/chat-service/internal/bot"
)

const (
	// DefaultModel dung khi GEMINI_MODEL de trong.
	DefaultModel = "gemini-2.5-flash-lite"

	// maxOutputTokens 512 ~ 350 chu tieng Viet, du cho 5 goi y san pham. Day la nut van
	// chi phi chinh: moi token sinh ra deu tinh tien.
	maxOutputTokens = 512

	// callTimeout chi la luoi an toan cho truong hop goi thang client nay ma khong qua
	// bot.Retrier. Duong chay that lay han tu ctx cua Retrier (bot.TotalBudget).
	callTimeout = 25 * time.Second

	// firstChunkTimeout: khong nhan duoc manh dau tien trong 10s thi coi nhu provider im
	// lang. Cat som o day de con ngan sach cho mot lan thu lai, thay vi ngoi het 25s roi
	// bao loi khi khong con gio de lam gi khac.
	firstChunkTimeout = 10 * time.Second
)

// Config la tham so dung Client.
type Config struct {
	APIKey string
	Model  string

	// BaseURL de trong o moi truong that. Test tro no vao httptest.Server de kiem duoc
	// phan de sai nhat — request body co dung ThinkingBudget 0 khong, 429 co map dung
	// khong — ma khong ton mot lan goi API that nao.
	BaseURL string
}

// Client hien thuc bot.Client bang Gemini.
type Client struct {
	models *genai.Models
	model  string
}

// Bao loi luc bien dich neu Client lech khoi giao dien bot.Client.
var _ bot.Client = (*Client)(nil)

// New dung client Gemini. Tra loi neu thieu API key — nhanh bot chi duoc bat khi that
// su co key, viec quyet dinh bat hay khong la cua main.go.
func New(cfg Config) (*Client, error) {
	if cfg.APIKey == "" {
		return nil, errors.New("thieu GEMINI_API_KEY")
	}

	model := cfg.Model
	if model == "" {
		model = DefaultModel
	}

	sdk, err := genai.NewClient(context.Background(), &genai.ClientConfig{
		APIKey:  cfg.APIKey,
		Backend: genai.BackendGeminiAPI,
		HTTPOptions: genai.HTTPOptions{
			BaseURL: cfg.BaseURL,
			// TAT retry cua SDK. Mac dinh cua no la 5 lan thu VA CO CA 429 trong danh
			// sach ma duoc thu lai — dung dieu quyet dinh quota cam. Retry that nam o
			// bot.Retrier de no phoi hop duoc voi breaker va hien ra trong log.
			RetryOptions: &genai.HTTPRetryOptions{Attempts: genai.Ptr[int32](1)},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("dung Gemini client loi: %w", err)
	}

	return &Client{models: sdk.Models, model: model}, nil
}

// Generate sinh mot luot tra loi. req.Stream=false goi mot phat (dung cho vong hoi tool),
// true thi doc stream va day tung manh qua sink.
func (c *Client) Generate(ctx context.Context, req bot.Request, sink bot.Sink) (bot.Result, error) {
	// Chi ap han rieng khi caller chua dat han nao: khong bao gio de mot lan goi provider
	// chay khong gioi han, nhung cung khong dam de len ngan sach 25s cua Retrier.
	if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, callTimeout)
		defer cancel()
	}

	// callCtx tach khoi ctx de watchdog huy rieng lan goi nay. Nho tach, luc bat loi ta
	// phan biet duoc "provider im lang" (callCtx chet, ctx con song) voi "nguoi dung dong
	// tab" (ctx chet theo).
	callCtx, cancelCall := context.WithCancel(ctx)
	defer cancelCall()

	watchdog := time.AfterFunc(firstChunkTimeout, cancelCall)
	defer watchdog.Stop()

	contents := toContents(req.History)
	config := buildConfig(req)
	acc := &accumulator{}

	if !req.Stream {
		resp, err := c.models.GenerateContent(callCtx, c.model, contents, config)
		if err != nil {
			return acc.finish(), mapError(ctx, callCtx, err)
		}
		watchdog.Stop()
		if err := acc.consume(resp, sink); err != nil {
			return acc.finish(), err
		}
		return acc.finish(), acc.blockedErr()
	}

	for resp, err := range c.models.GenerateContentStream(callCtx, c.model, contents, config) {
		if err != nil {
			return acc.finish(), mapError(ctx, callCtx, err)
		}
		// Manh dau da ve: go watchdog ra, tu day tro di chi con tran 25s cua ca request.
		watchdog.Stop()
		if err := acc.consume(resp, sink); err != nil {
			return acc.finish(), err
		}
	}

	return acc.finish(), acc.blockedErr()
}

// accumulator gom cac manh cua mot lan sinh lai thanh bot.Result.
type accumulator struct {
	text         strings.Builder
	toolCalls    []bot.ToolCall
	finishReason string
	blockReason  string
	promptTokens int32
	outputTokens int32
}

// consume doc mot response (mot chunk neu dang stream, ca cau tra loi neu khong) va day
// phan moi qua sink.
func (a *accumulator) consume(resp *genai.GenerateContentResponse, sink bot.Sink) error {
	if resp == nil {
		return nil
	}

	if resp.PromptFeedback != nil && resp.PromptFeedback.BlockReason != "" {
		a.blockReason = string(resp.PromptFeedback.BlockReason)
	}

	// Usage cua chunk sau ghi de chunk truoc: Gemini gui so cong don, chunk cuoi la so
	// day du. Cong don o day se dem hai lan.
	if resp.UsageMetadata != nil {
		a.promptTokens = resp.UsageMetadata.PromptTokenCount
		a.outputTokens = resp.UsageMetadata.CandidatesTokenCount
	}

	if len(resp.Candidates) == 0 {
		return nil
	}
	candidate := resp.Candidates[0]
	if candidate.FinishReason != "" {
		a.finishReason = string(candidate.FinishReason)
	}
	if candidate.Content == nil {
		return nil
	}

	for _, part := range candidate.Content.Parts {
		if part == nil {
			continue
		}

		// Bo phan "suy nghi" cua model. Voi ThinkingBudget 0 thi khong nen co, nhung neu
		// co thi day la doc thoai noi tam — day ra man hinh nguoi dung la ro ri thang.
		if part.Thought {
			continue
		}

		if part.FunctionCall != nil {
			call := bot.ToolCall{Name: part.FunctionCall.Name, Args: part.FunctionCall.Args}
			a.toolCalls = append(a.toolCalls, call)
			if sink != nil {
				if err := sink(bot.Event{Kind: bot.EventToolCall, ToolCall: &call}); err != nil {
					return err
				}
			}
			continue
		}

		if part.Text == "" {
			continue
		}
		a.text.WriteString(part.Text)
		if sink != nil {
			if err := sink(bot.Event{Kind: bot.EventText, Text: part.Text}); err != nil {
				return err
			}
		}
	}

	return nil
}

// blockedErr tra ErrBlocked neu lan sinh nay bi bo loc an toan chan. Tach khoi consume
// vi ly do chan co the nam o chunk bat ky, chi biet chac khi da doc het.
func (a *accumulator) blockedErr() error {
	if a.blockReason != "" {
		return fmt.Errorf("%w: prompt bi chan (%s)", bot.ErrBlocked, a.blockReason)
	}
	switch genai.FinishReason(a.finishReason) {
	case genai.FinishReasonSafety, genai.FinishReasonProhibitedContent,
		genai.FinishReasonBlocklist, genai.FinishReasonSPII, genai.FinishReasonRecitation:
		return fmt.Errorf("%w: model dung vi %s", bot.ErrBlocked, a.finishReason)
	}
	return nil
}

// finish chot ket qua. Goi duoc ca tren duong loi de tang tren van lay duoc phan chu da
// nhan truoc khi hong.
func (a *accumulator) finish() bot.Result {
	return bot.Result{
		Text:         a.text.String(),
		ToolCalls:    a.toolCalls,
		FinishReason: a.finishReason,
		PromptTokens: a.promptTokens,
		OutputTokens: a.outputTokens,
		Truncated:    genai.FinishReason(a.finishReason) == genai.FinishReasonMaxTokens,
	}
}

// buildConfig dung GenerateContentConfig cho mot request.
func buildConfig(req bot.Request) *genai.GenerateContentConfig {
	config := &genai.GenerateContentConfig{
		MaxOutputTokens: maxOutputTokens,

		// ThinkingBudget PHAI dat tuong minh bang 0. Dong Gemini 2.5 tinh thinking token
		// VAO output: de nil la model tu chon budget, token bay het vao phan suy nghi
		// khong ai doc duoc, roi cau tra loi bi cat ngang vi cham MaxOutputTokens. Hong
		// kieu nay im lang — log chi thay cau tra loi cut, khong thay bao loi nao.
		ThinkingConfig: &genai.ThinkingConfig{ThinkingBudget: genai.Ptr[int32](0)},
	}

	if req.SystemInstruction != "" {
		config.SystemInstruction = genai.NewContentFromText(req.SystemInstruction, genai.RoleUser)
	}

	if len(req.Tools) == 0 {
		return config
	}

	declarations := make([]*genai.FunctionDeclaration, 0, len(req.Tools))
	for _, tool := range req.Tools {
		declarations = append(declarations, &genai.FunctionDeclaration{
			Name:                 tool.Name,
			Description:          tool.Description,
			ParametersJsonSchema: tool.ParametersJSONSchema,
		})
	}
	config.Tools = []*genai.Tool{{FunctionDeclarations: declarations}}

	// AUTO: model tu quyet dinh co goi tool khong. ANY ep goi tool ca khi nguoi dung moi
	// chi chao hoi — vua ton mot vong goi vua tra ve danh sach san pham vo duyen.
	config.ToolConfig = &genai.ToolConfig{
		FunctionCallingConfig: &genai.FunctionCallingConfig{
			Mode: genai.FunctionCallingConfigModeAuto,
		},
	}

	return config
}

// toContents doi lich su hoi thoai sang kieu cua SDK.
func toContents(history []bot.Turn) []*genai.Content {
	contents := make([]*genai.Content, 0, len(history))
	for _, turn := range history {
		part := toPart(turn)
		if part == nil {
			continue
		}
		contents = append(contents, &genai.Content{
			Role:  string(sdkRole(turn.Role)),
			Parts: []*genai.Part{part},
		})
	}
	return contents
}

// toPart doi mot luot sang mot Part. Tra nil cho luot rong de khong gui len Content
// khong co noi dung — Gemini tu choi ca request vi mot phan tu rong nhu vay.
func toPart(turn bot.Turn) *genai.Part {
	switch {
	case turn.ToolCall != nil:
		return &genai.Part{FunctionCall: &genai.FunctionCall{
			Name: turn.ToolCall.Name,
			Args: turn.ToolCall.Args,
		}}
	case turn.ToolResult != nil:
		return &genai.Part{FunctionResponse: &genai.FunctionResponse{
			Name:     turn.ToolResult.Name,
			Response: turn.ToolResult.Payload,
		}}
	case turn.Text != "":
		return genai.NewPartFromText(turn.Text)
	default:
		return nil
	}
}

// sdkRole doi role cua tang bot sang role cua SDK.
func sdkRole(role bot.Role) genai.Role {
	if role == bot.RoleModel {
		return genai.RoleModel
	}
	return genai.RoleUser
}

// mapError doi loi cua SDK thanh loi chuan cua package bot. Day la toan bo cho ma tang
// tren "biet" ve Gemini — sai o day thi breaker se dem nham loai loi.
func mapError(parentCtx, callCtx context.Context, err error) error {
	// callCtx chet trong khi ctx cha con song = watchdog da ra tay vi khong co manh nao ve.
	if callCtx.Err() != nil && parentCtx.Err() == nil {
		return fmt.Errorf("%w: khong nhan duoc manh dau trong %s", bot.ErrTimeout, firstChunkTimeout)
	}
	if errors.Is(parentCtx.Err(), context.DeadlineExceeded) || errors.Is(err, context.DeadlineExceeded) {
		return fmt.Errorf("%w: qua han cua request", bot.ErrTimeout)
	}
	// Nguoi dung dong ket noi: tra nguyen loi, khong doi thanh loi cua provider — neu doi,
	// moi lan nguoi dung bo di giua chung se bi dem nhu mot lan provider hong.
	if errors.Is(parentCtx.Err(), context.Canceled) || errors.Is(err, context.Canceled) {
		return err
	}

	var apiErr genai.APIError
	if errors.As(err, &apiErr) {
		if kind := classifyAPIError(apiErr); kind != nil {
			return fmt.Errorf("%w: %s", kind, apiErr.Error())
		}
	}

	// Loi mang, loi doc stream, loi parse: coi la provider hong de breaker dem, nhung
	// khong phai 429 nen retry van duoc phep thu lai mot lan.
	return fmt.Errorf("%w: %v", bot.ErrUpstream, err)
}

// classifyAPIError xep mot APIError vao mot loai loi cua package bot, hoac nil neu
// khong nhan ra.
//
// Phai xet CA Code lan Status: APIError.Code duoc doc tu body JSON chu khong phai tu HTTP
// status, nen mot loi tra ve {"error":{"message":"..."}} thieu truong "code" se co
// Code == 0. Chi nhin Code thi mot lan 429 nhu vay bi xep nham thanh loi server va duoc
// thu lai — dung dieu quyet dinh quota cam.
func classifyAPIError(apiErr genai.APIError) error {
	switch {
	case apiErr.Code == 429 || apiErr.Status == "RESOURCE_EXHAUSTED":
		return bot.ErrRateLimited
	case apiErr.Code >= 500:
		return bot.ErrUpstream
	case apiErr.Status == "UNAVAILABLE" || apiErr.Status == "INTERNAL" || apiErr.Status == "DEADLINE_EXCEEDED":
		return bot.ErrUpstream
	case apiErr.Code >= 400:
		return bot.ErrBadRequest
	case apiErr.Status == "INVALID_ARGUMENT" || apiErr.Status == "PERMISSION_DENIED" ||
		apiErr.Status == "UNAUTHENTICATED" || apiErr.Status == "NOT_FOUND" ||
		apiErr.Status == "FAILED_PRECONDITION":
		return bot.ErrBadRequest
	default:
		return nil
	}
}
