-- GC quet theo cot thoi gian, khong theo khoa chinh. Thieu index thi moi lan chay
-- la mot lan quet tuan tu toan bang - dung bang dang phinh ma job nay sinh ra de
-- kiem soat, va ticker chay moi gio se khuech dai chi phi do len 24 lan mot ngay.
CREATE INDEX IF NOT EXISTS deleted_products_tombstone_deleted_at_idx
    ON deleted_products_tombstone (deleted_at);

CREATE INDEX IF NOT EXISTS processed_events_created_at_idx
    ON processed_events (created_at);
