-- Adds a nullable per-product station override used by
-- GET /reports/daily-sales-by-station. NULL means "not set, fall back to
-- the product's category" (see routes/reports.js for the fallback list).
ALTER TABLE products
  ADD COLUMN station VARCHAR(10) NULL DEFAULT NULL;

ALTER TABLE products
  ADD CONSTRAINT products_station_check CHECK (station IN ('drinks', 'kitchen') OR station IS NULL);
