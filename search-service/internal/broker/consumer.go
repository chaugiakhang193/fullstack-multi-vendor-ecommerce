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
	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	eventsExchange = "ecommerce.events"
	prefetchCount  = 10
)

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

// requeueDelay la khoang cho truoc khi Nack(requeue) khi ghi index loi, tranh hot-loop
// khi DB chet keo dai (message bi redeliver lien tuc). Chua co DLQ.
const requeueDelay = 2 * time.Second

// Consumer giu cau hinh can de (tai) ket noi RabbitMQ va tieu thu message, cong voi
// Store de ghi document vao index (DB#3).
type Consumer struct {
	url    string
	queue  string
	store  *index.Store
	logger *slog.Logger
}

// NewConsumer khoi tao consumer chua ket noi. Goi Run de bat dau vong doi. queue
// den tu config: moi moi truong (local / Render) dat ten rieng de khong chia nhau
// message tren cung mot broker.
func NewConsumer(url string, queue string, store *index.Store, logger *slog.Logger) *Consumer {
	return &Consumer{url: url, queue: queue, store: store, logger: logger}
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
			c.handleMessage(ctx, msg)
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
	return nil
}

// handleMessage decode envelope + payload roi ghi vao index (DB#3 Neon), dedup qua
// processed_events trong Store. Quyet dinh ack/nack:
//   - payload hong (decode/parse loi): Ack de bo (khong requeue vo ich) — chua co DLQ.
//   - ghi thanh cong hoac event trung: Ack.
//   - loi DB tam thoi: Nack(requeue) de redeliver, khong mat message.
func (c *Consumer) handleMessage(ctx context.Context, msg amqp.Delivery) {
	var env Envelope
	msgBody := msg.Body
	if err := json.Unmarshal(msgBody, &env); err != nil {
		c.logger.Error("decode envelope loi, bo message", "err", err)
		_ = msg.Ack(false)
		return
	}

	timeout := 10 * time.Second
	msgCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	var err error
	eventType := env.EventType
	eventID := env.EventID
	payload := env.Payload

	switch eventType {
	case "product.created", "product.updated":
		var p ProductSnapshot
		if decodeErr := json.Unmarshal(payload, &p); decodeErr != nil {
			c.logger.Error("decode ProductSnapshot loi, bo message", "eventId", eventID, "err", decodeErr)
			_ = msg.Ack(false)
			return
		}
		doc, convErr := toProductDoc(p)
		if convErr != nil {
			// updatedAt khong parse duoc = payload hong → ack-drop, requeue cung khong sua duoc.
			c.logger.Error("payload product hong, bo message", "eventId", eventID, "err", convErr)
			_ = msg.Ack(false)
			return
		}
		err = c.store.UpsertProduct(msgCtx, eventID, doc)
	case "product.deleted":
		var d ProductDeleted
		if decodeErr := json.Unmarshal(payload, &d); decodeErr != nil {
			c.logger.Error("decode ProductDeleted loi, bo message", "eventId", eventID, "err", decodeErr)
			_ = msg.Ack(false)
			return
		}
		productID := d.ProductID
		err = c.store.DeleteProduct(msgCtx, eventID, productID)
	default:
		// Khong nen xay ra vi chi bind 3 key; phong thu: ack de khong ket.
		c.logger.Warn("eventType la, bo qua", "eventType", eventType, "eventId", eventID)
		_ = msg.Ack(false)
		return
	}

	c.ackOrRetry(msg, env, err)
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

	productID := p.ProductID
	name := p.Name
	slug := p.Slug
	description := p.Description
	price := p.Price
	shopID := p.ShopID
	categoryID := p.CategoryID
	thumbnailURL := p.ThumbnailURL
	status := p.Status
	isHidden := p.IsHidden

	return index.ProductDoc{
		ProductID:    productID,
		Name:         name,
		Slug:         slug,
		Description:  description,
		Price:        price,
		ShopID:       shopID,
		CategoryID:   categoryID,
		ThumbnailURL: thumbnailURL,
		Status:       status,
		IsHidden:     isHidden,
		UpdatedAt:    updatedAt,
	}, nil
}

// ackOrRetry quyet dinh ack/nack theo ket qua ghi index:
//   - nil: ghi thanh cong → ack.
//   - ErrDuplicateEvent: event da xu ly (processed_events trung) → ack, skip.
//   - loi khac (DB tam thoi): cho requeueDelay roi Nack(requeue=true) de redeliver, khong
//     mat message. Delay tranh hot-loop khi DB chet keo dai.
func (c *Consumer) ackOrRetry(msg amqp.Delivery, env Envelope, err error) {
	eventID := env.EventID
	eventType := env.EventType
	switch {
	case err == nil:
		multiple := false
		if ackErr := msg.Ack(multiple); ackErr != nil {
			c.logger.Error("ack loi", "eventId", eventID, "err", ackErr)
		}
	case errors.Is(err, index.ErrDuplicateEvent):
		c.logger.Info("event da xu ly truoc do, skip", "eventId", eventID, "eventType", eventType)
		multiple := false
		if ackErr := msg.Ack(multiple); ackErr != nil {
			c.logger.Error("ack loi", "eventId", eventID, "err", ackErr)
		}
	default:
		c.logger.Warn("ghi index loi, se redeliver", "eventId", eventID, "eventType", eventType, "err", err)
		time.Sleep(requeueDelay)
		multiple := false
		requeue := true
		if nackErr := msg.Nack(multiple, requeue); nackErr != nil {
			c.logger.Error("nack loi", "eventId", eventID, "err", nackErr)
		}
	}
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
