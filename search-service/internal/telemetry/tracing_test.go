package telemetry

import (
	"context"
	"testing"

	amqp "github.com/rabbitmq/amqp091-go"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

// Traceparent mau lay tu vi du trong W3C Trace Context spec. Tach san TraceID/SpanID
// de assert duoc tung phan thay vi so sanh ca chuoi.
const (
	sampleTraceID     = "4bf92f3577b34da6a3ce929d0e0e4736"
	sampleSpanID      = "00f067aa0ba902b7"
	sampleTraceparent = "00-" + sampleTraceID + "-" + sampleSpanID + "-01"
)

func TestAMQPHeaderCarrierCaseInsensitive(t *testing.T) {
	headers := amqp.Table{
		"TRACEPARENT": sampleTraceparent,
	}

	carrier := AMQPHeaderCarrier(headers)
	valLower := carrier.Get("traceparent")
	valUpper := carrier.Get("TRACEPARENT")
	valMixed := carrier.Get("TraceParent")

	expected := sampleTraceparent

	if valLower != expected {
		t.Errorf("Get(traceparent) = %q, want %q", valLower, expected)
	}
	if valUpper != expected {
		t.Errorf("Get(TRACEPARENT) = %q, want %q", valUpper, expected)
	}
	if valMixed != expected {
		t.Errorf("Get(TraceParent) = %q, want %q", valMixed, expected)
	}
}

// TestAMQPHeaderCarrierGetValueKhongPhaiString: amqp.Table cho phep value la int32/bool/[]byte
// chu khong chi string, nen Get phai format ve chuoi thay vi tra rong. Kem case key khong
// ton tai vi propagator luon hoi ca tracestate lan baggage du message khong co.
func TestAMQPHeaderCarrierGetValueKhongPhaiString(t *testing.T) {
	carrier := AMQPHeaderCarrier(amqp.Table{
		"x-retry-count": int32(2),
		"x-flag":        true,
	})

	if got := carrier.Get("khong-ton-tai"); got != "" {
		t.Errorf("Get(khong-ton-tai) = %q, muon chuoi rong", got)
	}
	if got := carrier.Get("x-retry-count"); got != "2" {
		t.Errorf("Get(x-retry-count) = %q, muon %q", got, "2")
	}
	if got := carrier.Get("X-Flag"); got != "true" {
		t.Errorf("Get(X-Flag) = %q, muon %q", got, "true")
	}
}

// TestAMQPHeaderCarrierSetVaKeys: carrier la alias cua amqp.Table nen Set phai ghi thang
// vao table goc (day la cach inject traceparent luc publish), khong duoc ghi vao ban sao.
func TestAMQPHeaderCarrierSetVaKeys(t *testing.T) {
	headers := amqp.Table{}
	carrier := AMQPHeaderCarrier(headers)
	carrier.Set("traceparent", sampleTraceparent)

	if got := headers["traceparent"]; got != sampleTraceparent {
		t.Errorf("Set khong ghi vao amqp.Table goc: got %v", got)
	}

	keys := carrier.Keys()
	if len(keys) != 1 || keys[0] != "traceparent" {
		t.Errorf("Keys() = %v, muon [traceparent]", keys)
	}
}

// TestExtractAMQPContextNoiDungTrace kiem tra ctx tra ve mang dung TraceID/SpanID cua
// header. Assert ctx != nil la vo nghia: Extract khong bao gio tra nil nen test kieu do
// van xanh ca khi ham bi rong ruot thanh "return ctx".
func TestExtractAMQPContextNoiDungTrace(t *testing.T) {
	otel.SetTextMapPropagator(propagation.TraceContext{})

	headers := amqp.Table{"traceparent": sampleTraceparent}
	sc := trace.SpanContextFromContext(ExtractAMQPContext(context.Background(), headers))

	if !sc.IsValid() {
		t.Fatal("span context khong hop le: traceparent chua duoc extract")
	}
	if got := sc.TraceID().String(); got != sampleTraceID {
		t.Errorf("TraceID = %q, muon %q", got, sampleTraceID)
	}
	if got := sc.SpanID().String(); got != sampleSpanID {
		t.Errorf("SpanID = %q, muon %q", got, sampleSpanID)
	}
	if !sc.IsRemote() {
		t.Error("span context phai duoc danh dau remote vi den tu service khac")
	}
	if !sc.IsSampled() {
		t.Error("mat co sampled (duoi -01) nen backend se bo qua span nay")
	}
}

// TestExtractAMQPContextHeaderVietHoa: day moi la ly do carrier phai case-insensitive.
// Neu chi test rieng Get() thi khong biet propagator co that su noi duoc trace hay khong.
func TestExtractAMQPContextHeaderVietHoa(t *testing.T) {
	otel.SetTextMapPropagator(propagation.TraceContext{})

	headers := amqp.Table{"TraceParent": sampleTraceparent}
	sc := trace.SpanContextFromContext(ExtractAMQPContext(context.Background(), headers))

	if got := sc.TraceID().String(); got != sampleTraceID {
		t.Errorf("TraceID = %q, muon %q. Header viet hoa dang lam dut trace", got, sampleTraceID)
	}
}

// TestExtractAMQPContextKhongCoTraceparent: message khong mang trace (vd publisher cu chua
// instrument) phai tra ctx sach de consumer tu mo trace moi, khong dinh span context rac.
func TestExtractAMQPContextKhongCoTraceparent(t *testing.T) {
	otel.SetTextMapPropagator(propagation.TraceContext{})

	cases := map[string]amqp.Table{
		"headers nil":       nil,
		"headers rong":      {},
		"khong traceparent": {"x-retry-count": int32(2)},
	}

	for name, headers := range cases {
		t.Run(name, func(t *testing.T) {
			sc := trace.SpanContextFromContext(ExtractAMQPContext(context.Background(), headers))
			if sc.IsValid() {
				t.Errorf("khong co traceparent nhung van sinh span context hop le: %v", sc)
			}
		})
	}
}

// TestParseSampleRatioHopLe: cac gia tri dung phai qua nguyen ven, va chuoi rong
// (bien chua dat tren Render) phai giu hanh vi cu la lay het trace.
func TestParseSampleRatioHopLe(t *testing.T) {
	cases := map[string]struct {
		raw  string
		want float64
	}{
		"chuoi rong":      {"", 1.0},
		"chi co khoang":   {"   ", 1.0},
		"mot phan muoi":   {"0.1", 0.1},
		"tat han":         {"0", 0},
		"lay het":         {"1", 1.0},
		"co khoang trang": {" 0.25 ", 0.25},
		"dang khoa hoc":   {"1e-2", 0.01},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			got, err := ParseSampleRatio(tc.raw)
			if err != nil {
				t.Fatalf("ParseSampleRatio(%q) tra loi bat ngo: %v", tc.raw, err)
			}
			if got != tc.want {
				t.Errorf("ParseSampleRatio(%q) = %v, muon %v", tc.raw, got, tc.want)
			}
		})
	}
}

// TestParseSampleRatioHong: input hong phai vua bao loi (de main log canh bao) vua tra
// ve mot ti le dung duoc. Tra ti le vo nghia kem error se lam service chay voi sampler
// hong neu caller lo bo qua error.
func TestParseSampleRatioHong(t *testing.T) {
	cases := map[string]struct {
		raw  string
		want float64
	}{
		"khong phai so": {"mot nua", 1.0},
		"dung dau phay": {"0,1", 1.0},
		"co hau to":     {"10%", 1.0},
		"NaN":           {"NaN", 1.0},
		"am":            {"-0.5", 0},
		"lon hon 1":     {"1.5", 1},
		"vo cuc":        {"+Inf", 1},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			got, err := ParseSampleRatio(tc.raw)
			if err == nil {
				t.Fatalf("ParseSampleRatio(%q) khong bao loi, main se khong co gi de canh bao", tc.raw)
			}
			if got != tc.want {
				t.Errorf("ParseSampleRatio(%q) = %v, muon %v", tc.raw, got, tc.want)
			}
		})
	}
}
