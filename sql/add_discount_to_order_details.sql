-- Moves discounts from per-order to per-line (order_details), run manually
-- BEFORE deploying the backend that reads order_details.discount_id/discount.
--
-- Existing orders: the order-level discount was applied to every line of the
-- order equally, so copying it onto each line keeps all report numbers the same.
-- orders.discount_id / orders.discount are kept (not dropped) for history.
BEGIN;

ALTER TABLE order_details
  ADD COLUMN IF NOT EXISTS discount_id INTEGER NULL REFERENCES discount(id),
  ADD COLUMN IF NOT EXISTS discount NUMERIC(5,2) NULL;

-- Only touches lines that don't have a discount yet, so it is safe to re-run
UPDATE order_details od
SET discount_id = o.discount_id,
    discount = o.discount
FROM orders o
WHERE o.id = od.orderid
  AND (o.discount_id IS NOT NULL OR o.discount IS NOT NULL)
  AND od.discount_id IS NULL
  AND od.discount IS NULL;

COMMIT;

-- Check afterwards (both counts should match):
--   SELECT COUNT(*) FROM order_details od JOIN orders o ON o.id = od.orderid WHERE o.discount_id IS NOT NULL;
--   SELECT COUNT(*) FROM order_details WHERE discount_id IS NOT NULL;
