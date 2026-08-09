package telemetry

import (
	"context"
	"testing"

	amqp "github.com/rabbitmq/amqp091-go"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
)

func TestAMQPHeaderCarrierCaseInsensitive(t *testing.T) {
	headers := amqp.Table{
		"TRACEPARENT": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
	}

	carrier := AMQPHeaderCarrier(headers)
	valLower := carrier.Get("traceparent")
	valUpper := carrier.Get("TRACEPARENT")
	valMixed := carrier.Get("TraceParent")

	expected := "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"

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

func TestExtractAMQPContext(t *testing.T) {
	otel.SetTextMapPropagator(propagation.TraceContext{})

	headers := amqp.Table{
		"traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
	}

	parentCtx := context.Background()
	extractedCtx := ExtractAMQPContext(parentCtx, headers)

	if extractedCtx == nil {
		t.Fatal("extractedCtx nil")
	}
}
