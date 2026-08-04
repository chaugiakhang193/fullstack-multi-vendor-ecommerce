package broker

import "encoding/json"

// Envelope la hinh dang message relay monolith day len exchange ecommerce.events.
// Khop OutboxEnvelope tai backend/src/modules/engagements/outbox.relay.ts:
//
//	{ eventId, eventType, occurredAt, payload }
//
// Payload de json.RawMessage vi moi eventType co hinh dang khac nhau; decode
// tiep tuy eventType o handleMessage.
type Envelope struct {
	EventID    string          `json:"eventId"`
	EventType  string          `json:"eventType"`
	OccurredAt string          `json:"occurredAt"`
	Payload    json.RawMessage `json:"payload"`
}

// ProductSnapshot khop ProductSearchSnapshotPayload phia monolith
// (backend/src/common/constants/outbox.constants.ts). Dung cho product.created
// va product.updated — cung mot hinh dang, consumer re-index toan bo document.
//
// Price giu nguyen string (numeric(12,2) da chuan hoa 2 chu so), khong parse
// float o tang nay de tranh sai so; tang index se xu ly tiep.
// Cac field nullable dung con tro de phan biet "null" voi "chuoi rong".
type ProductSnapshot struct {
	ProductID    string  `json:"productId"`
	Name         string  `json:"name"`
	Slug         string  `json:"slug"`
	Description  *string `json:"description"`
	Price        string  `json:"price"`
	ShopID       string  `json:"shopId"`
	CategoryID   *string `json:"categoryId"`
	ThumbnailURL *string `json:"thumbnailUrl"`
	Status       string  `json:"status"`
	IsHidden     bool    `json:"isHidden"`
	UpdatedAt    string  `json:"updatedAt"`
}

// ProductDeleted khop ProductDeletedOutboxPayload — chi can id de (sau nay) xoa
// document khoi index.
type ProductDeleted struct {
	ProductID string `json:"productId"`
}
