-- Cot unaccent(name) stored de index trigram: unaccent() la STABLE nen khong the tao
-- expression index truc tiep (giong ly do 000002 dung trigger thay generated column).
ALTER TABLE product_index ADD COLUMN name_unaccent text;

-- Mo rong trigger 000002: set THEM name_unaccent, GIU NGUYEN phan search_vector.
CREATE OR REPLACE FUNCTION product_index_tsvector_update() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('simple', unaccent(coalesce(NEW.name, ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(coalesce(NEW.description, ''))), 'B');
    NEW.name_unaccent := unaccent(coalesce(NEW.name, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill row cu: UPDATE kich trigger ben tren tinh lai ca 2 cot (idempotent).
UPDATE product_index SET name_unaccent = unaccent(coalesce(name, ''));

-- GIN trigram: tang toc toan tu <% (word_similarity) cho tim mot phan / sai chinh ta.
CREATE INDEX product_index_name_unaccent_trgm
    ON product_index USING gin (name_unaccent gin_trgm_ops);
