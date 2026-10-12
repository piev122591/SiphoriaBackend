-- One-time backfill of products.station from category, run manually.
-- Only touches rows where station is still NULL, so it won't overwrite
-- any manual per-product overrides set after the column was added.
BEGIN;

UPDATE products p
SET station = 'drinks'
FROM category c
WHERE c.id = p.categoryid
  AND p.station IS NULL
  AND c.name IN ('Signature Coffee', 'Classic Coffee', 'Milk Based', 'Matcha Series', 'Garden Refresher');

UPDATE products
SET station = 'kitchen'
WHERE station IS NULL;

COMMIT;
