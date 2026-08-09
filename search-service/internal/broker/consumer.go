package broker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/rand"
	"time"

	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/search-service/internal/index"
	"github.com/chaugiakhang193/fullstack-multi-vendor-ecommerce/search-service/internal/telemetry"
	amqp "github.com/rabbitmq/amqp091-go"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

const (
	eventsExchange = "ecommerce.events"
	retryExchange  = "ecommerce.retry"
	retryTTL       = 10000 // 10s
	prefetchCount  = 10
	maxRetries     = 3
)

// indexStore la interface hep cho phan store ma consumer thuc su can. Tach interface
// de test tiem duoc fake tra loi DB co chu dich (test retry/DLQ) ma khong can DB that.
// *index.Store thoa interface nay.
type indexStore interface {
	UpsertProduct(ctx context.Context, eventID string, doc index.ProductDoc) error
	DeleteProduct(ctx context.Context, eventID string, productID string, deletedAt time.Time) error
}

// publisher la interface hep cho thao tac publish len broker. Tach interface de test
// tiem duoc fake (ghi lai message da publish, hoac gia lap loi publish) ma khong can
// RabbitMQ that. *amqp.Channel thoa interface nay qua PublishWithContext.
type publisher interface {
	PublishWithContext(ctx context.Context, exchange, key string, mandatory, immediate bool, msg amqp.Publishing) error
}

// bindingKeys la routing key search-service quan tam. KHONG bind wildcard
// product.* vi product.moderated la payload khac danh cho notification-service.
var bindingKeys = []string{
	"product.created",
	"product.updated",
	"product.deleted",
}

// reconnectDelays la bac thang backoff khi mat ket noi; cham tran thi giu nguyen
// moc cuoi. Port tu notification-service (RECONNECT_DELAYS_MS).
var reconnectDelays = []time.Duration{
	1 * time.Second,
	2 * time.Second,
	5 * time.Second,
	10 * time.Second,
	30 * time.Second,
}

// Consumer giu cau hinh can de (tai) ket noi RabbitMQ va tieu thu message, cong voi
// Store de ghi document vao index (DB#3).
type Consumer struct {
	url             string
	queue           string
	retryQueue      string
	dlqQueue        string
	retryRoutingKey string
	dlqRoutingKey   string
	store           indexStore
	logger          *slog.Logger
	metrics         *telemetry.Metrics
}

// NewConsumer khoi tao consumer chua ket noi. Goi Run de bat dau vong doi. queue
// den tu config: moi moi truong (local / Render) dat ten rieng de khong chia nhau
// message tren cung mot broker.
func NewConsumer(url string, queue string, store *index.Store, logger *slog.Logger) *Consumer {
	return &Consumer{
		url:             url,
		queue:           queue,
		retryQueue:      queue + ".retry",
		dlqQueue:        queue + ".dlq",
		retryRoutingKey: "retry." + queue,
		dlqRoutingKey:   "dlq." + queue,
		store:           store,
		logger:          logger,
		metrics:         telemetry.GetMetrics(),
	}
}

// Run chay vong doi consumer toi khi ctx bi huy (graceful shutdown). Moi lan
// mat ket noi, cho theo backoff + jitter roi thu lai — khong bao gio thoat vi
// loi tam thoi, chi thoat khi ctx.Done().
func (c *Consumer) Run(ctx context.Context) {
	attempt := 0
	for {
		if ctx.Err() != nil {
			return
		}

		connected, err := c.connectAndConsume(ctx)
		if ctx.Err() != nil {
			// Huy chu dong: coi nhu thoat em, khong log loi.
			return
		}
		if err != nil {
			c.logger.Warn("consumer rot ket noi", "err", err)
		}
		// Ket noi tung thanh cong roi moi rot thi reset bac backoff ve dau, de
		// lan rot ke tiep khong bi phat delay dai cua chuoi fail truoc do.
		if connected {
			attempt = 0
		}

		delay := backoffWithJitter(attempt)
		attempt++
		c.logger.Warn("thu ket noi lai RabbitMQ", "sau", delay.String(), "lan", attempt)

		select {
		case <-ctx.Done():
			return
		case <-time.After(delay):
		}
	}
}

// connectAndConsume mo 1 ket noi + channel, dung topology, roi chan tieu thu
// message toi khi ket noi dong hoac ctx bi huy. Tra (true, nil) khi ctx huy sau
// khi da online; (true, err) khi rot ket noi; (false, err) khi loi ngay luc dung.
func (c *Consumer) connectAndConsume(ctx context.Context) (bool, error) {
	conn, err := amqp.Dial(c.url)
	if err != nil {
		return false, err
	}
	defer conn.Close()

	ch, err := conn.Channel()
	if err != nil {
		return false, err
	}
	defer ch.Close()

	if err := c.setupTopology(ch); err != nil {
		return false, err
	}

	if err := ch.Qos(prefetchCount, 0, false); err != nil {
		return false, err
	}

	msgs, err := ch.Consume(
		c.queue,
		"",    // consumer tag tu sinh
		false, // autoAck=false: ack thu cong sau khi xu ly xong
		false, // exclusive
		false, // noLocal (RabbitMQ khong ho tro, de false)
		false, // noWait
		nil,
	)
	if err != nil {
		return false, err
	}

	c.logger.Info("consumer online", "queue", c.queue, "keys", bindingKeys)

	// Kenh bao ket noi dong (mang rot, broker restart). Nhan duoc value nghia la
	// phai thoat vong de Run backoff thu lai.
	closeErr := conn.NotifyClose(make(chan *amqp.Error, 1))

	for {
		select {
		case <-ctx.Done():
			return true, nil
		case err := <-closeErr:
			if err != nil {
				return true, err
			}
			return true, amqp.ErrClosed
		case msg, ok := <-msgs:
			if !ok {
				// Kenh deliveries dong — coi nhu mat ket noi.
				return true, amqp.ErrClosed
			}
			c.handleMessage(ctx, ch, msg)
		}
	}
}

// setupTopology assert exchange + queue + binding idempotent. Publisher (relay
// monolith) moi la ben declare exchange chinh thuc; assert o day de consumer
// khoi dong TRUOC relay van khong loi.
func (c *Consumer) setupTopology(ch *amqp.Channel) error {
	if err := ch.ExchangeDeclare(eventsExchange, "topic", true, false, false, false, nil); err != nil {
		return err
	}
	// Queue durable, arg-free — bat bien, khop convention notifications.q.
	if _, err := ch.QueueDeclare(c.queue, true, false, false, false, nil); err != nil {
		return err
	}
	for _, key := range bindingKeys {
		if err := ch.QueueBind(c.queue, key, eventsExchange, false, nil); err != nil {
			return err
		}
	}

	// Declare DLQ & Retry Topology dong theo c.queue
	if err := ch.ExchangeDeclare(retryExchange, "direct", true, false, false, false, nil); err != nil {
		return err
	}
	retryArgs := amqp.Table{
		"x-message-ttl":             int32(retryTTL),
		"x-dead-letter-exchange":    "",
		"x-dead-letter-routing-key": c.queue,
	}
	if _, err := ch.QueueDeclare(c.retryQueue, true, false, false, false, retryArgs); err != nil {
		return err
	}
	if err := ch.QueueBind(c.retryQueue, c.retryRoutingKey, retryExchange, false, nil); err != nil {
		return err
	}

	if _, err := ch.QueueDeclare(c.dlqQueue, true, false, false, false, nil); err != nil {
		return err
	}
	if err := ch.QueueBind(c.dlqQueue, c.dlqRoutingKey, retryExchange, false, nil); err != nil {
		return err
	}

	return nil
}

// handleMessage decode envelope + payload roi ghi vao index (DB#3 Neon), dedup qua
// processed_events trong Store. Quyet dinh ack/nack/retry/dlq:
//   - payload hong (decode/parse loi, thieu occurredAt): sendToDLQ va Ack.
//   - ghi thanh cong hoac event trung / tombstone blocked: Ack.
//   - loi DB tam thoi: sendToRetry tang x-retry-count (toi da maxRetries) roi DLQ, Ack.
//   - publish retry/dlq loi: Nack(requeue=true) de khong mat message.
func (c *Consumer) handleMessage(ctx context.Context, pub publisher, msg amqp.Delivery) {
	// Extract W3C traceparent tu headers VA tao Consumer Span TRUOC
	msgCtx := telemetry.ExtractAMQPContext(ctx, msg.Headers)
	tracer := otel.Tracer("search-consumer")
	msgCtx, span := tracer.Start(msgCtx, "consume "+msg.RoutingKey,
		trace.WithSpanKind(trace.SpanKindConsumer),
		trace.WithAttributes(
			attribute.String("messaging.system", "rabbitmq"),
			attribute.String("messaging.destination", eventsExchange),
			attribute.String("messaging.rabbitmq.routing_key", msg.RoutingKey),
		),
	)
	defer span.End()

	var env Envelope
	if err := json.Unmarshal(msg.Body, &env); err != nil {
		c.logger.Error("decode envelope loi, gui DLQ", "err", err)
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		if pubErr := c.sendToDLQ(ctx, pub, msg); pubErr != nil {
			c.logger.Error("publish DLQ loi, nack requeue", "err", pubErr)
			_ = msg.Nack(false, true)
			return
		}
		c.metrics.EventsProcessedTotal.WithLabelValues("unknown", "poison").Inc()
		_ = msg.Ack(false)
		return
	}

	timeout := 10 * time.Second
	// procCtx duoc tao TU msgCtx de truyen span context vao cac DB operations
	procCtx, cancel := context.WithTimeout(msgCtx, timeout)
	defer cancel()

	var err error
	eventType := env.EventType
	eventID := env.EventID
	payload := env.Payload

	switch eventType {
	case "product.created", "product.updated":
		var p ProductSnapshot
		if decodeErr := json.Unmarshal(payload, &p); decodeErr != nil {
			c.logger.Error("decode ProductSnapshot loi, gui DLQ", "eventId", eventID, "err", decodeErr)
			span.RecordError(decodeErr)
			span.SetStatus(codes.Error, decodeErr.Error())
			if pubErr := c.sendToDLQ(ctx, pub, msg); pubErr != nil {
				c.logger.Error("publish DLQ loi, nack requeue", "err", pubErr)
				_ = msg.Nack(false, true)
				return
			}
			c.metrics.EventsProcessedTotal.WithLabelValues(eventType, "poison").Inc()
			_ = msg.Ack(false)
			return
		}
		doc, convErr := toProductDoc(p)
		if convErr != nil {
			c.logger.Error("payload product hong, gui DLQ", "eventId", eventID, "err", convErr)
			span.RecordError(convErr)
			span.SetStatus(codes.Error, convErr.Error())
			if pubErr := c.sendToDLQ(ctx, pub, msg); pubErr != nil {
				c.logger.Error("publish DLQ loi, nack requeue", "err", pubErr)
				_ = msg.Nack(false, true)
				return
			}
			c.metrics.EventsProcessedTotal.WithLabelValues(eventType, "poison").Inc()
			_ = msg.Ack(false)
			return
		}
		err = c.store.UpsertProduct(procCtx, eventID, doc)

	case "product.deleted":
		var d ProductDeleted
		if decodeErr := json.Unmarshal(payload, &d); decodeErr != nil {
			c.logger.Error("decode ProductDeleted loi, gui DLQ", "eventId", eventID, "err", decodeErr)
			span.RecordError(decodeErr)
			span.SetStatus(codes.Error, decodeErr.Error())
			if pubErr := c.sendToDLQ(ctx, pub, msg); pubErr != nil {
				c.logger.Error("publish DLQ loi, nack requeue", "err", pubErr)
				_ = msg.Nack(false, true)
				return
			}
			c.metrics.EventsProcessedTotal.WithLabelValues(eventType, "poison").Inc()
			_ = msg.Ack(false)
			return
		}
		productID := d.ProductID
		if env.OccurredAt == "" {
			timeErr := errors.New("envelope thieu occurredAt timestamp")
			c.logger.Error("payload delete thieu occurredAt, gui DLQ", "eventId", eventID)
			span.RecordError(timeErr)
			span.SetStatus(codes.Error, timeErr.Error())
			if pubErr := c.sendToDLQ(ctx, pub, msg); pubErr != nil {
				c.logger.Error("publish DLQ loi, nack requeue", "err", pubErr)
				_ = msg.Nack(false, true)
				return
			}
			c.metrics.EventsProcessedTotal.WithLabelValues(eventType, "poison").Inc()
			_ = msg.Ack(false)
			return
		}
		deletedAt, pErr := time.Parse(time.RFC3339, env.OccurredAt)
		if pErr != nil {
			c.logger.Error("parse occurredAt loi, gui DLQ", "eventId", eventID, "err", pErr)
			span.RecordError(pErr)
			span.SetStatus(codes.Error, pErr.Error())
			if pubErr := c.sendToDLQ(ctx, pub, msg); pubErr != nil {
				c.logger.Error("publish DLQ loi, nack requeue", "err", pubErr)
				_ = msg.Nack(false, true)
				return
			}
			c.metrics.EventsProcessedTotal.WithLabelValues(eventType, "poison").Inc()
			_ = msg.Ack(false)
			return
		}
		err = c.store.DeleteProduct(procCtx, eventID, productID, deletedAt)

	default:
		// Khong nen xay ra vi chi bind 3 key; phong thu: ack de khong ket.
		// Label la "unknown" chu KHONG phai eventType: day la nhanh duy nhat eventType
		// chua qua switch loc nen no la chuoi tuy y tu body JSON, gan thang vao label
		// se lam Prometheus sinh time series moi cho moi gia tri la. Gia tri that da
		// nam trong log ngay tren.
		c.logger.Warn("eventType la, bo qua", "eventType", eventType, "eventId", eventID)
		c.metrics.EventsProcessedTotal.WithLabelValues("unknown", "skipped").Inc()
		_ = msg.Ack(false)
		return
	}

	c.processResult(ctx, span, pub, msg, env, err)
}

// processResult quyet dinh ack/nack/retry/dlq theo ket qua ghi index:
//   - nil: ghi thanh cong -> ack.
//   - ErrDuplicateEvent: event da xu ly (processed_events trung) -> ack, skip.
//   - ErrTombstoneBlocked: event update bi chan boi tombstone -> ack, skip.
//   - loi DB/network: retry maxRetries lan qua retry queue, roi sang DLQ.
func (c *Consumer) processResult(ctx context.Context, span trace.Span, pub publisher, msg amqp.Delivery, env Envelope, err error) {
	eventID := env.EventID
	eventType := env.EventType

	switch {
	case err == nil:
		c.metrics.EventsProcessedTotal.WithLabelValues(eventType, "success").Inc()
		_ = msg.Ack(false)

	case errors.Is(err, index.ErrDuplicateEvent):
		c.logger.Info("event da xu ly truoc do, skip", "eventId", eventID, "eventType", eventType)
		c.metrics.EventsProcessedTotal.WithLabelValues(eventType, "duplicate").Inc()
		_ = msg.Ack(false)

	case errors.Is(err, index.ErrTombstoneBlocked):
		c.logger.Info("event update bi chan boi tombstone, skip", "eventId", eventID, "eventType", eventType)
		c.metrics.EventsProcessedTotal.WithLabelValues(eventType, "tombstone_blocked").Inc()
		_ = msg.Ack(false)

	default:
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		retryCount := getRetryCount(msg.Headers)
		if retryCount >= maxRetries {
			c.logger.Error("het luot retry, chuyen sang DLQ", "eventId", eventID, "eventType", eventType, "err", err)
			if pubErr := c.sendToDLQ(ctx, pub, msg); pubErr != nil {
				c.logger.Error("publish DLQ loi, nack requeue", "err", pubErr)
				_ = msg.Nack(false, true)
				return
			}
			c.metrics.EventsProcessedTotal.WithLabelValues(eventType, "dlq").Inc()
			_ = msg.Ack(false)
		} else {
			c.logger.Warn("ghi index loi, chuyen retry queue", "eventId", eventID, "retry", retryCount+1, "err", err)
			if pubErr := c.sendToRetry(ctx, pub, msg, retryCount+1); pubErr != nil {
				c.logger.Error("publish retry loi, nack requeue", "err", pubErr)
				_ = msg.Nack(false, true)
				return
			}
			c.metrics.EventsProcessedTotal.WithLabelValues(eventType, "retry").Inc()
			_ = msg.Ack(false)
		}
	}
}

// sendToRetry publish message sang ecommerce.retry direct exchange voi routing key retry.{queue} va header x-retry-count.
func (c *Consumer) sendToRetry(ctx context.Context, pub publisher, msg amqp.Delivery, nextRetry int) error {
	// Clone header thay vi sua truc tiep tren delivery goc: neu publish loi va roi vao
	// nhanh Nack(requeue), delivery goc phai giu nguyen traceparent + header ban dau.
	headers := cloneHeaders(msg.Headers)
	headers["x-retry-count"] = int32(nextRetry)

	return pub.PublishWithContext(ctx,
		retryExchange,
		c.retryRoutingKey,
		false,
		false,
		amqp.Publishing{
			Headers:      headers,
			ContentType:  msg.ContentType,
			Body:         msg.Body,
			DeliveryMode: amqp.Persistent,
		},
	)
}

// sendToDLQ publish message sang ecommerce.retry direct exchange voi routing key dlq.{queue}.
func (c *Consumer) sendToDLQ(ctx context.Context, pub publisher, msg amqp.Delivery) error {
	return pub.PublishWithContext(ctx,
		retryExchange,
		c.dlqRoutingKey,
		false,
		false,
		amqp.Publishing{
			Headers:      msg.Headers,
			ContentType:  msg.ContentType,
			Body:         msg.Body,
			DeliveryMode: amqp.Persistent,
		},
	)
}

// cloneHeaders sao chep nong bang header de sua ban sao ma khong dung den delivery goc.
// Giu nguyen traceparent va moi header khac; chi ban sao moi duoc them x-retry-count.
func cloneHeaders(src amqp.Table) amqp.Table {
	dst := make(amqp.Table, len(src)+1)
	for k, v := range src {
		dst[k] = v
	}
	return dst
}

// getRetryCount lay gia tri header x-retry-count tu amqp.Table, tra ve 0 neu khong co.
func getRetryCount(headers amqp.Table) int {
	if headers == nil {
		return 0
	}
	val, ok := headers["x-retry-count"]
	if !ok {
		return 0
	}
	if count, isInt := val.(int32); isInt {
		return int(count)
	}
	return 0
}

// toProductDoc chuyen ProductSnapshot (broker) sang index.ProductDoc, parse updatedAt tu
// ISO 8601 sang time.Time. time.RFC3339 cua Go chap nhan ca giay le (vd ...56.789Z) nen
// khop dinh dang JS toISOString(). Loi parse = payload hong.
func toProductDoc(p ProductSnapshot) (index.ProductDoc, error) {
	updatedAtStr := p.UpdatedAt
	layout := time.RFC3339
	updatedAt, err := time.Parse(layout, updatedAtStr)
	if err != nil {
		return index.ProductDoc{}, fmt.Errorf("parse updatedAt %q loi: %w", updatedAtStr, err)
	}

	return index.ProductDoc{
		ProductID:    p.ProductID,
		Name:         p.Name,
		Slug:         p.Slug,
		Description:  p.Description,
		Price:        p.Price,
		ShopID:       p.ShopID,
		CategoryID:   p.CategoryID,
		ThumbnailURL: p.ThumbnailURL,
		Status:       p.Status,
		IsHidden:     p.IsHidden,
		UpdatedAt:    updatedAt,
	}, nil
}

// backoffWithJitter tra delay theo bac thang reconnectDelays voi jitter +-20%
// (chong thundering herd khi nhieu client cung rot). Go 1.20+ tu seed global
// rand nen khong can Seed thu cong.
func backoffWithJitter(attempt int) time.Duration {
	idx := attempt
	if idx >= len(reconnectDelays) {
		idx = len(reconnectDelays) - 1
	}
	base := reconnectDelays[idx]
	factor := 0.8 + rand.Float64()*0.4
	return time.Duration(float64(base) * factor)
}
