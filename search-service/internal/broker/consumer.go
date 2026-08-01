package broker

import (
	"context"
	"encoding/json"
	"log/slog"
	"math/rand"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	eventsExchange = "ecommerce.events"
	searchQueue    = "search_index.q"
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

// Consumer giu cau hinh can de (tai) ket noi RabbitMQ va tieu thu message.
type Consumer struct {
	url    string
	logger *slog.Logger
}

// NewConsumer khoi tao consumer chua ket noi. Goi Run de bat dau vong doi.
func NewConsumer(url string, logger *slog.Logger) *Consumer {
	return &Consumer{url: url, logger: logger}
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
		searchQueue,
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

	c.logger.Info("consumer online", "queue", searchQueue, "keys", bindingKeys)

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
			c.handleMessage(msg)
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
	if _, err := ch.QueueDeclare(searchQueue, true, false, false, false, nil); err != nil {
		return err
	}
	for _, key := range bindingKeys {
		if err := ch.QueueBind(searchQueue, key, eventsExchange, false, nil); err != nil {
			return err
		}
	}
	return nil
}

// handleMessage decode envelope + payload theo eventType roi log. GIAI DOAN T5:
// chi log + ack de chung minh duong ong thong; ghi vao index (DB#3 Neon) la T7.
// Ack SAU khi xu ly xong vi autoAck=false. Message hong thi ack de roi queue
// (chua co DLQ) va log to.
func (c *Consumer) handleMessage(msg amqp.Delivery) {
	var env Envelope
	if err := json.Unmarshal(msg.Body, &env); err != nil {
		c.logger.Error("decode envelope loi, bo message", "err", err)
		_ = msg.Ack(false)
		return
	}

	switch env.EventType {
	case "product.created", "product.updated":
		var p ProductSnapshot
		if err := json.Unmarshal(env.Payload, &p); err != nil {
			c.logger.Error("decode ProductSnapshot loi", "eventId", env.EventID, "err", err)
			_ = msg.Ack(false)
			return
		}
		c.logger.Info("nhan product snapshot",
			"eventType", env.EventType,
			"eventId", env.EventID,
			"productId", p.ProductID,
			"name", p.Name,
			"price", p.Price,
			"status", p.Status,
			"isHidden", p.IsHidden,
			"updatedAt", p.UpdatedAt,
		)
	case "product.deleted":
		var d ProductDeleted
		if err := json.Unmarshal(env.Payload, &d); err != nil {
			c.logger.Error("decode ProductDeleted loi", "eventId", env.EventID, "err", err)
			_ = msg.Ack(false)
			return
		}
		c.logger.Info("nhan product deleted", "eventId", env.EventID, "productId", d.ProductID)
	default:
		// Khong nen xay ra vi chi bind 3 key, nhung phong thu: ack de khong ket.
		c.logger.Warn("eventType la, bo qua", "eventType", env.EventType, "eventId", env.EventID)
	}

	if err := msg.Ack(false); err != nil {
		c.logger.Error("ack loi", "eventId", env.EventID, "err", err)
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
