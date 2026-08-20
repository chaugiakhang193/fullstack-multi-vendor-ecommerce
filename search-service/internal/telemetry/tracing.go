package telemetry

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"

	amqp "github.com/rabbitmq/amqp091-go"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

// defaultSampleRatio: lay het trace. Giu lam mac dinh vi du an chua cam backend co
// quota, va mat trace luc dang debug ton kem hon la ton dung luong.
const defaultSampleRatio = 1.0

// ParseSampleRatio doc ti le sampling tu chuoi env OTEL_TRACES_SAMPLER_ARG.
// Chuoi rong = khong cau hinh -> lay het. Input hong hoac ngoai [0,1] van tra ve mot
// ti le dung duoc KEM error: sampling la nut van quota, khong dang lam service chet
// luc khoi dong; caller ghi log canh bao roi chay tiep.
func ParseSampleRatio(raw string) (float64, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return defaultSampleRatio, nil
	}

	ratio, err := strconv.ParseFloat(trimmed, 64)
	if err != nil {
		return defaultSampleRatio, fmt.Errorf("OTEL_TRACES_SAMPLER_ARG %q khong phai so, dung %v: %w", raw, defaultSampleRatio, err)
	}
	// NaN truot moi phep so sanh nen phai bat rieng, neu khong no chui qua ca hai
	// nhanh clamp roi vao thang TraceIDRatioBased.
	if math.IsNaN(ratio) {
		return defaultSampleRatio, fmt.Errorf("OTEL_TRACES_SAMPLER_ARG %q la NaN, dung %v", raw, defaultSampleRatio)
	}
	if ratio < 0 {
		return 0, fmt.Errorf("OTEL_TRACES_SAMPLER_ARG %q am, clamp ve 0 (tat sampling)", raw)
	}
	if ratio > 1 {
		return 1, fmt.Errorf("OTEL_TRACES_SAMPLER_ARG %q lon hon 1, clamp ve 1 (lay het)", raw)
	}

	return ratio, nil
}

// InitTracer khoi tao OpenTelemetry TracerProvider voi OTLP HTTP exporter. Neu enabled=false, tra ve nil.
// sampleRatio nen lay tu ParseSampleRatio: InitTracer khong tu kiem tra mien gia tri.
func InitTracer(ctx context.Context, enabled bool, serviceName, endpoint string, sampleRatio float64) (*sdktrace.TracerProvider, error) {
	if !enabled {
		return nil, nil
	}

	if endpoint == "" {
		endpoint = "http://localhost:4318/v1/traces"
	}
	if serviceName == "" {
		serviceName = "search-service"
	}

	// KHONG dat WithInsecure(): option duoc ap dung tuan tu, cai sau ghi de cai truoc,
	// nen WithInsecure() dung sau WithEndpointURL() se ep plaintext ke ca khi endpoint
	// la https. De WithEndpointURL tu suy scheme: http:// -> plaintext (local), https://
	// -> TLS (backend that nhu Grafana Cloud / Tempo).
	exporter, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpointURL(endpoint),
	)
	if err != nil {
		return nil, fmt.Errorf("tao OTLP trace exporter loi: %w", err)
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceNameKey.String(serviceName),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("tao resource OTel loi: %w", err)
	}

	// ParentBased de quyet dinh sampling chi duoc chot MOT LAN o dau chuoi (monolith)
	// roi cac service sau theo co sampled trong traceparent. Neu moi service tu quay
	// xac suat rieng thi trace se bi cat khuc, dung cai ma ca chuoi nay sinh ra de xem.
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(sampleRatio))),
	)

	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	return tp, nil
}

// AMQPHeaderCarrier boc amqp.Table de implement TextMapCarrier cho OpenTelemetry.
type AMQPHeaderCarrier amqp.Table

// Get truy xuat header value khong phan biet hoa thuong.
func (c AMQPHeaderCarrier) Get(key string) string {
	target := strings.ToLower(key)
	for k, v := range c {
		if strings.ToLower(k) == target {
			if str, isStr := v.(string); isStr {
				return str
			}
			return fmt.Sprintf("%v", v)
		}
	}
	return ""
}

// Set gan header value vao carrier.
func (c AMQPHeaderCarrier) Set(key string, value string) {
	c[key] = value
}

// Keys tra ve danh sach cac key trong carrier.
func (c AMQPHeaderCarrier) Keys() []string {
	keys := make([]string, 0, len(c))
	for k := range c {
		keys = append(keys, k)
	}
	return keys
}

// ExtractAMQPContext trich xuat trace context tu AMQP headers.
func ExtractAMQPContext(ctx context.Context, headers amqp.Table) context.Context {
	if headers == nil {
		return ctx
	}
	carrier := AMQPHeaderCarrier(headers)
	return otel.GetTextMapPropagator().Extract(ctx, carrier)
}
