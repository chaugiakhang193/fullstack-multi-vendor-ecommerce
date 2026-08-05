-- Populate product_index.search_vector qua trigger. Dung 'simple' config (khong stemming
-- tieng Anh) + unaccent de "dien thoai" khop "dien thoai". setweight A cho name, B cho
-- description → ts_rank sau nay xep khop-ten tren khop-mo-ta.
--
-- Vi sao trigger chu khong phai generated column: generated column doi bieu thuc IMMUTABLE,
-- nhung unaccent() chi STABLE → Postgres tu choi. Trigger function khong bi rang buoc do.

CREATE OR REPLACE FUNCTION product_index_tsvector_update() RETURNS trigger AS $$
BEGIN
    -- coalesce('') vi description nullable: to_tsvector(NULL) tra NULL, keo ca bieu thuc
    -- ve NULL va mat luon phan name.
    NEW.search_vector :=
        setweight(to_tsvector('simple', unaccent(coalesce(NEW.name, ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(coalesce(NEW.description, ''))), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_index_tsvector_trg
    BEFORE INSERT OR UPDATE ON product_index
    FOR EACH ROW
    EXECUTE FUNCTION product_index_tsvector_update();

-- Backfill row cu (search_vector dang NULL). UPDATE nay kich trigger ben tren nen ban than
-- gia tri gan o day se bi trigger tinh lai (cung bieu thuc, idempotent) — de ro y dinh.
UPDATE product_index
SET search_vector =
    setweight(to_tsvector('simple', unaccent(coalesce(name, ''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(description, ''))), 'B');
