package bot

import "context"

// Role la vai tro cua mot luot trong hoi thoai gui len model. Chi co hai gia tri: tool
// KHONG phai role thu ba — ket qua tool di kem mot luot cua nguoi dung, dung theo cach
// Gemini nhan function response.
type Role string

const (
	RoleUser  Role = "user"
	RoleModel Role = "model"
)

// ToolCall la mot lan model xin goi tool. Args de nguyen map[string]any vi tang nay
// khong biet tool nao ton tai — doc Args la viec cua ben dang ky tool do.
type ToolCall struct {
	Name string
	Args map[string]any

	// Signature la chu ky provider dong kem lan goi tool nay. Tang bot khong doc noi dung,
	// chi giu de tra lai nguyen ven o vong sau: Gemini 3 tra 400 neu functionCall quay len
	// ma thieu chu ky. Rong la hop le — provider khac co the khong dung truong nay.
	Signature []byte
}

// ToolResult la ket qua tra nguoc cho model o vong sau. Payload bat buoc la map de
// serialize thanh JSON object: Gemini khong nhan gia tri tran (chuoi, so) o cho nay.
type ToolResult struct {
	Name    string
	Payload map[string]any
}

// Turn la mot luot da xay ra trong hoi thoai. Ba truong noi dung loai tru nhau: hoac
// Text, hoac ToolCall (luot cua model), hoac ToolResult (luot nguoi dung mang ket qua
// tool ve). Gop ca ba vao mot kieu de lich su hoi thoai la MOT lat cat duy nhat truyen
// xuong provider, thay vi ba tham so roi phai ghep lai dung thu tu o tung cho goi.
type Turn struct {
	Role       Role
	Text       string
	ToolCall   *ToolCall
	ToolResult *ToolResult
}

// ToolSpec khai bao mot tool cho model. ParametersJSONSchema la JSON Schema duoi dang
// map chu khong phai kieu rieng cua SDK, de package nay khong keo theo phu thuoc
// provider nao.
type ToolSpec struct {
	Name                 string
	Description          string
	ParametersJSONSchema map[string]any
}

// Request la mot lan goi model. Stream=false dung cho vong hoi tool (chi can biet model
// co goi tool khong), Stream=true cho vong tra loi cuoi.
type Request struct {
	SystemInstruction string
	History           []Turn
	Tools             []ToolSpec
	Stream            bool
}

// EventKind phan biet manh ket qua day ra trong luc model dang sinh.
type EventKind int

const (
	EventText EventKind = iota
	EventToolCall
)

// Event la mot manh ket qua. Handler SSE ghi thang Event nay ra day, nen no phai nho
// va khong mang kieu cua SDK.
type Event struct {
	Kind     EventKind
	Text     string
	ToolCall *ToolCall
}

// Result la tong ket sau khi model sinh xong. Text la toan bo phan chu da ghep lai —
// tang tren can no de luu vao bang message, khong phai de hien thi (chu da di qua sink
// tu truoc do roi).
type Result struct {
	Text         string
	ToolCalls    []ToolCall
	FinishReason string
	PromptTokens int32
	OutputTokens int32
	// Truncated bao model bi cat vi cham tran token chu khong phai tu ket thuc cau.
	Truncated bool
}

// Sink nhan tung Event. Tra ve loi khac nil se dung stream ngay — day la duong bao
// "nguoi dung dong tab roi, thoi dung sinh nua".
type Sink func(Event) error

// Client la cong ra LLM. Client KHONG tu chay vong function calling: no sinh mot luot
// roi dung. Vong tool (goi lan 1 lay ToolCall, chay tool, goi lan 2 lay chu) la viec
// cua tang dieu phoi ben tren — nho vay retry/breaker/timeout o day chi phai dung mot
// lan goi, va test cua chung khong dinh gi toi khai niem tool.
type Client interface {
	Generate(ctx context.Context, req Request, sink Sink) (Result, error)
}
