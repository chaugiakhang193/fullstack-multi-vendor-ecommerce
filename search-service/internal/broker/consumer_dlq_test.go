package broker

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/search-service/internal/index"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/search-service/internal/telemetry"
	amqp "github.com/rabbitmq/amqp091-go"
)

// fakeStore gia lap indexStore: tra loi cau hinh san de test nhanh nhanh retry/DLQ.
type fakeStore struct {
	upsertErr error
	deleteErr error
}

func (f *fakeStore) UpsertProduct(ctx context.Context, eventID string, doc index.ProductDoc) error {
	return f.upsertErr
}

func (f *fakeStore) DeleteProduct(ctx context.Context, eventID string, productID string, deletedAt time.Time) error {
	return f.deleteErr
}

// publishedMessage ghi lai 1 lan publish de assert routing key va header.
type publishedMessage struct {
	exchange string
	key      string
	msg      amqp.Publishing
}

// fakePublisher ghi lai cac lan publish; neu failWith != nil thi gia lap loi publish.
type fakePublisher struct {
	published []publishedMessage
	failWith  error
}

func (p *fakePublisher) PublishWithContext(ctx context.Context, exchange, key string, mandatory, immediate bool, msg amqp.Publishing) error {
	if p.failWith != nil {
		return p.failWith
	}
	p.published = append(p.published, publishedMessage{exchange: exchange, key: key, msg: msg})
	return nil
}

// fakeAck thoa amqp.Acknowledger, gan vao Delivery.Acknowledger de assert Ack/Nack.
type fakeAck struct {
	acked       bool
	nacked      bool
	nackRequeue bool
}

func (a *fakeAck) Ack(tag uint64, multiple bool) error {
	a.acked = true
	return nil
}

func (a *fakeAck) Nack(tag uint64, multiple, requeue bool) error {
	a.nacked = true
	a.nackRequeue = requeue
	return nil
}

func (a *fakeAck) Reject(tag uint64, requeue bool) error {
	a.nacked = true
	a.nackRequeue = requeue
	return nil
}

func newTestConsumer(store indexStore) *Consumer {
	queue := "search_index.q"
	return &Consumer{
		queue:           queue,
		retryQueue:      queue + ".retry",
		dlqQueue:        queue + ".dlq",
		retryRoutingKey: "retry." + queue,
		dlqRoutingKey:   "dlq." + queue,
		store:           store,
		logger:          slog.New(slog.NewTextHandler(io.Discard, nil)),
		metrics:         telemetry.GetMetrics(),
	}
}

func newDelivery(ack amqp.Acknowledger, routingKey string, headers amqp.Table, body []byte) amqp.Delivery {
	return amqp.Delivery{
		Acknowledger: ack,
		RoutingKey:   routingKey,
		Headers:      headers,
		Body:         body,
		ContentType:  "application/json",
	}
}

// validUpsertBody tao envelope product.updated hop le (parse duoc), de loi duy nhat
// den tu store gia lap chu khong phai payload hong.
func validUpsertBody(t *testing.T) []byte {
	t.Helper()
	payload := ProductSnapshot{
		ProductID: "11111111-1111-1111-1111-111111111111",
		Name:      "Ao thun",
		Slug:      "ao-thun",
		Price:     "150000.00",
		ShopID:    "22222222-2222-2222-2222-222222222222",
		Status:    "APPROVED",
		UpdatedAt: "2026-08-01T10:20:56.789Z",
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload loi: %v", err)
	}
	env := Envelope{
		EventID:    "e1",
		EventType:  "product.updated",
		OccurredAt: "2026-08-01T10:20:56.789Z",
		Payload:    payloadBytes,
	}
	envBytes, err := json.Marshal(env)
	if err != nil {
		t.Fatalf("marshal envelope loi: %v", err)
	}
	return envBytes
}

// TestPoisonMessageRouting: envelope JSON hong -> publish vao {queue}.dlq va ACK original.
func TestPoisonMessageRouting(t *testing.T) {
	ack := &fakeAck{}
	pub := &fakePublisher{}
	c := newTestConsumer(&fakeStore{})

	msg := newDelivery(ack, "product.updated", nil, []byte("{ khong-phai-json"))
	c.handleMessage(context.Background(), pub, msg)

	if len(pub.published) != 1 {
		t.Fatalf("muon 1 publish, co %d", len(pub.published))
	}
	if pub.published[0].key != c.dlqRoutingKey {
		t.Errorf("routing key = %q, muon %q", pub.published[0].key, c.dlqRoutingKey)
	}
	if !ack.acked {
		t.Errorf("poison message phai duoc ACK sau khi publish DLQ thanh cong")
	}
	if ack.nacked {
		t.Errorf("khong duoc NACK khi publish DLQ thanh cong")
	}
}

// TestMissingOccurredAtRouting: product.deleted thieu occurredAt -> DLQ nhu poison.
func TestMissingOccurredAtRouting(t *testing.T) {
	ack := &fakeAck{}
	pub := &fakePublisher{}
	c := newTestConsumer(&fakeStore{})

	body := []byte(`{"eventId":"e1","eventType":"product.deleted","occurredAt":"","payload":{"productId":"11111111-1111-1111-1111-111111111111"}}`)
	msg := newDelivery(ack, "product.deleted", nil, body)
	c.handleMessage(context.Background(), pub, msg)

	if len(pub.published) != 1 || pub.published[0].key != c.dlqRoutingKey {
		t.Fatalf("muon route vao DLQ, co %+v", pub.published)
	}
	if !ack.acked {
		t.Errorf("phai ACK sau khi publish DLQ")
	}
}

// TestTransientErrorRetryThenDLQ: loi DB tam thoi -> retry queue x-retry-count tang dan,
// het maxRetries -> DLQ.
func TestTransientErrorRetryThenDLQ(t *testing.T) {
	c := newTestConsumer(&fakeStore{upsertErr: errors.New("db tam thoi chet")})
	body := validUpsertBody(t)

	for attempt := 0; attempt < maxRetries; attempt++ {
		ack := &fakeAck{}
		pub := &fakePublisher{}
		headers := amqp.Table{}
		if attempt > 0 {
			headers["x-retry-count"] = int32(attempt)
		}
		msg := newDelivery(ack, "product.updated", headers, body)
		c.handleMessage(context.Background(), pub, msg)

		if len(pub.published) != 1 {
			t.Fatalf("attempt %d: muon 1 publish, co %d", attempt, len(pub.published))
		}
		if pub.published[0].key != c.retryRoutingKey {
			t.Errorf("attempt %d: key = %q, muon retry %q", attempt, pub.published[0].key, c.retryRoutingKey)
		}
		if got := pub.published[0].msg.Headers["x-retry-count"]; got != int32(attempt+1) {
			t.Errorf("attempt %d: x-retry-count = %v, muon %d", attempt, got, attempt+1)
		}
		if !ack.acked {
			t.Errorf("attempt %d: phai ACK sau khi publish retry", attempt)
		}
	}

	// Da dat maxRetries -> chuyen DLQ.
	ack := &fakeAck{}
	pub := &fakePublisher{}
	headers := amqp.Table{"x-retry-count": int32(maxRetries)}
	msg := newDelivery(ack, "product.updated", headers, body)
	c.handleMessage(context.Background(), pub, msg)

	if len(pub.published) != 1 || pub.published[0].key != c.dlqRoutingKey {
		t.Fatalf("het retry phai vao DLQ, co %+v", pub.published)
	}
	if !ack.acked {
		t.Errorf("phai ACK sau khi publish DLQ")
	}
}

// TestPublishFailureNoAck: publish loi -> KHONG ACK, phai Nack(requeue=true) de khong mat message.
func TestPublishFailureNoAck(t *testing.T) {
	ack := &fakeAck{}
	pub := &fakePublisher{failWith: errors.New("broker tu choi publish")}
	c := newTestConsumer(&fakeStore{})

	msg := newDelivery(ack, "product.updated", nil, []byte("{ hong"))
	c.handleMessage(context.Background(), pub, msg)

	if ack.acked {
		t.Errorf("publish loi thi KHONG duoc ACK (tranh mat message)")
	}
	if !ack.nacked || !ack.nackRequeue {
		t.Errorf("publish loi phai Nack(requeue=true): acked=%v nacked=%v requeue=%v", ack.acked, ack.nacked, ack.nackRequeue)
	}
}

// TestRetryPreservesTraceparent: retry giu nguyen traceparent va KHONG mutate header goc.
func TestRetryPreservesTraceparent(t *testing.T) {
	ack := &fakeAck{}
	pub := &fakePublisher{}
	c := newTestConsumer(&fakeStore{upsertErr: errors.New("db chet")})

	tp := "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"
	headers := amqp.Table{"traceparent": tp}
	msg := newDelivery(ack, "product.updated", headers, validUpsertBody(t))
	c.handleMessage(context.Background(), pub, msg)

	if len(pub.published) != 1 {
		t.Fatalf("muon 1 publish, co %d", len(pub.published))
	}
	if got := pub.published[0].msg.Headers["traceparent"]; got != tp {
		t.Errorf("traceparent = %v, muon giu nguyen %q", got, tp)
	}
	if _, exists := headers["x-retry-count"]; exists {
		t.Errorf("header delivery goc bi mutate; phai clone truoc khi them x-retry-count")
	}
}
