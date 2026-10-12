// Per-inventory quantity_remaining, matching GET /inventory:
// total stocked-in (inventory_details) minus consumption by completed orders (status_id = 2).
// Use as a CTE body: `WITH stock AS (${STOCK_REMAINING_SQL}) ...` -> (inventory_id, quantity_remaining)
const STOCK_REMAINING_SQL = `
  SELECT
    i.id AS inventory_id,
    COALESCE(stocked.total_stocked, 0) - COALESCE(consumed.total_used, 0) AS quantity_remaining
  FROM inventory i
  LEFT JOIN (
    SELECT inventory_id, SUM(quantity) AS total_stocked
    FROM inventory_details
    GROUP BY inventory_id
  ) stocked ON stocked.inventory_id = i.id
  LEFT JOIN (
    SELECT pdi.inventory_id, SUM(pdi.quantity_used * od.qty) AS total_used
    FROM product_details_inventory pdi
    JOIN order_details od ON od.product_details_id = pdi.product_details_id
    JOIN orders o ON o.id = od.orderid
    WHERE o.status_id = 2
    GROUP BY pdi.inventory_id
  ) consumed ON consumed.inventory_id = i.id
`;

module.exports = { STOCK_REMAINING_SQL };
