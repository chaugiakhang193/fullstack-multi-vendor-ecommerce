package telemetry

import (
	"context"
	"fmt"
	"strings"

	amqp "github.com/rabbitmq/amqp091-go"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

// InitTracer khoi tao OpenTelemetry TracerProvider voi OTLP HTTP exporter. Neu enabled=false, tra ve nil.
func InitTracer(ctx context.Context, enabled bool, serviceName, endpoint string) (*sdktrace.TracerProvider, error) {
	if !enabled {
		return nil, nil
	}

	if endpoint == "" {
		endpoint = "http://localhost:4318/v1/traces"
	}
	if serviceName == "" {
		serviceName = "search-service"
	}

	exporter, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpointURL(endpoint),
		otlptracehttp.WithInsecure(),
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

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
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
