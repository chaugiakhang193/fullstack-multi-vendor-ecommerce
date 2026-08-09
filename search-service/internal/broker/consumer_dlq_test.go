package broker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/search-service/internal/index"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/search-service/internal/telemetry"
	"github.com/prometheus/client_golang/prometheus/testutil"
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

// metricCount doc gia tri hien tai cua 1 child counter. Metrics la singleton toan cuc dung
// chung ca package nen phai so delta truoc/sau, khong so tuyet doi.
func metricCount(t *testing.T, eventType string, result string) float64 {
	t.Helper()
	return testutil.ToFloat64(telemetry.GetMetrics().EventsProcessedTotal.WithLabelValues(eventType, result))
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

	before := metricCount(t, "unknown", "nack_requeue")
	msg := newDelivery(ack, "product.updated", nil, []byte("{ hong"))
	c.handleMessage(context.Background(), pub, msg)

	if ack.acked {
		t.Errorf("publish loi thi KHONG duoc ACK (tranh mat message)")
	}
	if !ack.nacked || !ack.nackRequeue {
		t.Errorf("publish loi phai Nack(requeue=true): acked=%v nacked=%v requeue=%v", ack.acked, ack.nacked, ack.nackRequeue)
	}
	if got := metricCount(t, "unknown", "nack_requeue"); got != before+1 {
		t.Errorf("metric nack_requeue tang %v, muon 1: broker chet ma dashboard khong thay gi", got-before)
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

// TestRetryPublishFailureNoAck: publish sang RETRY that bai phai Nack(requeue=true).
// TestPublishFailureNoAck chi phu duoc nhanh publish DLQ cua poison message, nhanh retry
// nam o processResult va truoc day chua test nao cham toi.
func TestRetryPublishFailureNoAck(t *testing.T) {
	ack := &fakeAck{}
	pub := &fakePublisher{failWith: errors.New("broker tu choi publish")}
	c := newTestConsumer(&fakeStore{upsertErr: errors.New("db tam thoi chet")})

	before := metricCount(t, "product.updated", "nack_requeue")
	msg := newDelivery(ack, "product.updated", nil, validUpsertBody(t))
	c.handleMessage(context.Background(), pub, msg)

	if ack.acked {
		t.Errorf("publish retry loi thi KHONG duoc ACK (tranh mat message)")
	}
	if !ack.nacked || !ack.nackRequeue {
		t.Errorf("phai Nack(requeue=true): acked=%v nacked=%v requeue=%v", ack.acked, ack.nacked, ack.nackRequeue)
	}
	if got := metricCount(t, "product.updated", "nack_requeue"); got != before+1 {
		t.Errorf("metric nack_requeue tang %v, muon 1", got-before)
	}
}

// TestDLQPublishFailureHetRetryNoAck: het luot retry MA publish DLQ cung hong thi van phai
// Nack(requeue=true). Neu ACK o day thi message bien mat han, khong con o queue lan DLQ.
func TestDLQPublishFailureHetRetryNoAck(t *testing.T) {
	ack := &fakeAck{}
	pub := &fakePublisher{failWith: errors.New("broker tu choi publish")}
	c := newTestConsumer(&fakeStore{upsertErr: errors.New("db tam thoi chet")})

	before := metricCount(t, "product.updated", "nack_requeue")
	headers := amqp.Table{"x-retry-count": int32(maxRetries)}
	msg := newDelivery(ack, "product.updated", headers, validUpsertBody(t))
	c.handleMessage(context.Background(), pub, msg)

	if ack.acked {
		t.Errorf("publish DLQ loi thi KHONG duoc ACK (tranh mat message)")
	}
	if !ack.nacked || !ack.nackRequeue {
		t.Errorf("phai Nack(requeue=true): acked=%v nacked=%v requeue=%v", ack.acked, ack.nacked, ack.nackRequeue)
	}
	if got := metricCount(t, "product.updated", "nack_requeue"); got != before+1 {
		t.Errorf("metric nack_requeue tang %v, muon 1", got-before)
	}
}

// TestSentinelErrorAckKhongPublish: ErrDuplicateEvent va ErrTombstoneBlocked la ket cuc cuoi
// cung chu khong phai loi tam thoi, nen phai ACK va TUYET DOI khong day sang retry/DLQ.
// Case tombstone boc loi bang %w de chot rang code dung errors.Is chu khong phai so sanh ==.
func TestSentinelErrorAckKhongPublish(t *testing.T) {
	cases := []struct {
		name   string
		err    error
		result string
	}{
		{"duplicate", index.ErrDuplicateEvent, "duplicate"},
		{"tombstone blocked", fmt.Errorf("upsert product_index loi: %w", index.ErrTombstoneBlocked), "tombstone_blocked"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ack := &fakeAck{}
			pub := &fakePublisher{}
			c := newTestConsumer(&fakeStore{upsertErr: tc.err})

			before := metricCount(t, "product.updated", tc.result)
			c.handleMessage(context.Background(), pub, newDelivery(ack, "product.updated", nil, validUpsertBody(t)))

			if !ack.acked {
				t.Errorf("phai ACK: day la ket cuc cuoi cung, redeliver lai cung the")
			}
			if ack.nacked {
				t.Errorf("khong duoc NACK")
			}
			if len(pub.published) != 0 {
				t.Errorf("khong duoc day sang retry/DLQ, da publish %+v", pub.published)
			}
			if got := metricCount(t, "product.updated", tc.result); got != before+1 {
				t.Errorf("metric result=%q tang %v, muon 1", tc.result, got-before)
			}
		})
	}
}

// TestUnknownEventTypeLabelBiChan: nhanh default la cho duy nhat eventType chua qua switch
// loc, no den thang tu body JSON. Label phai la hang "unknown", khong duoc lay gia tri tu
// body ra lam label vi Prometheus se sinh time series moi cho moi gia tri la.
func TestUnknownEventTypeLabelBiChan(t *testing.T) {
	ack := &fakeAck{}
	pub := &fakePublisher{}
	c := newTestConsumer(&fakeStore{})

	const eventTypeLa = "product.exploded.f39a1c"
	body := []byte(`{"eventId":"e9","eventType":"` + eventTypeLa + `","occurredAt":"2026-08-01T10:20:56.789Z","payload":{}}`)

	before := metricCount(t, "unknown", "skipped")
	c.handleMessage(context.Background(), pub, newDelivery(ack, "product.updated", nil, body))

	if !ack.acked {
		t.Errorf("eventType la phai duoc ACK de khong ket queue")
	}
	if len(pub.published) != 0 {
		t.Errorf("eventType la khong phai poison, khong duoc publish: %+v", pub.published)
	}
	if got := metricCount(t, "unknown", "skipped"); got != before+1 {
		t.Errorf("metric (unknown, skipped) tang %v, muon 1", got-before)
	}
	if got := metricCount(t, eventTypeLa, "skipped"); got != 0 {
		t.Errorf("eventType tu body bi dung lam label metric (=%v): Prometheus phinh cardinality vo han", got)
	}
}
