DROP TRIGGER IF EXISTS product_index_tsvector_trg ON product_index;
DROP FUNCTION IF EXISTS product_index_tsvector_update();
-- Tra cot ve trang thai truoc task (NULL). GIN index + cot van do migration #1 quan ly.
UPDATE product_index SET search_vector = NULL;
