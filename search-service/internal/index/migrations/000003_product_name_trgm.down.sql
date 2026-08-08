DROP INDEX IF EXISTS product_index_name_unaccent_trgm;

-- Khoi phuc trigger ve ban 000002 (bo phan name_unaccent).
CREATE OR REPLACE FUNCTION product_index_tsvector_update() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('simple', unaccent(coalesce(NEW.name, ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(coalesce(NEW.description, ''))), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE product_index DROP COLUMN IF EXISTS name_unaccent;
