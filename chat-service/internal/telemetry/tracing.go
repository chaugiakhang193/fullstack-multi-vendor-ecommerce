package telemetry

import (
	"context"
	"fmt"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

// InitTracer khoi tao OpenTelemetry TracerProvider voi OTLP HTTP exporter. Neu
// enabled=false, tra ve nil - service van chay binh thuong, chi khong xuat trace.
func InitTracer(ctx context.Context, enabled bool, serviceName, endpoint string) (*sdktrace.TracerProvider, error) {
	if !enabled {
		return nil, nil
	}

	if endpoint == "" {
		endpoint = "http://localhost:4318/v1/traces"
	}
	if serviceName == "" {
		serviceName = "chat-service"
	}

	// Khong dat WithInsecure(): option duoc ap dung tuan tu, cai sau ghi de cai truoc,
	// nen WithInsecure() dung sau WithEndpointURL() se ep plaintext ke ca khi endpoint
	// la https. De WithEndpointURL tu suy scheme tu endpoint: http:// -> plaintext,
	// https:// -> TLS.
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

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)

	otel.SetTracerProvider(tp)
	// Propagator W3C traceparent de noi trace giua cac service (monolith -> chat-service
	// -> search-service) thanh cung mot waterfall.
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	return tp, nil
}
