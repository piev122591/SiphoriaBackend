const express = require('express');
const router = express.Router();

/**
 * @swagger
 * /reports/daily-sales:
 *   get:
 *     tags:
 *       - Reports
 *     summary: Get daily sales report (total serving, gross sales, food cost, discount, VAT, gross profit) for a date range. Prices are VAT-inclusive, so VAT = amount charged × 12/112. Senior Citizen / PWD Privileges lines are VAT-exempt: VAT is 0 and the removed VAT portion is reported as vat_exempt. gross_profit = gross_sales - discount - vat - vat_exempt - food_cost.
 *     parameters:
 *       - in: query
 *         name: start_date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         example: "2026-08-01"
 *       - in: query
 *         name: end_date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         example: "2026-08-05"
 *     responses:
 *       200:
 *         description: List of daily sales report rows
 *       400:
 *         description: start_date and end_date are required
 */
router.get('/daily-sales', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date are required' });
    }

    const result = await pool.query(
      `SELECT
         report_date,
         SUM(total_serving) AS total_serving,
         SUM(gross_sales) AS gross_sales,
         SUM(food_cost) AS food_cost,
         SUM(discount_amount) AS discount_amount,
         SUM(vat) AS vat,
         SUM(vat_exempt) AS vat_exempt,
         SUM(gross_sales) - SUM(food_cost) - SUM(discount_amount) - SUM(vat) - SUM(vat_exempt) AS gross_profit
       FROM (
         SELECT
           o.order_date::date AS report_date,
           od.qty AS total_serving,
           od.fc::numeric * od.qty AS food_cost,
           -- od.price is the price actually charged (already net of any discount /
           -- VAT-exempt adjustment). Gross sales, discount, and VAT are derived by
           -- inverting that transformation using the line's own discount_id/discount, since it's
           -- exactly reversible.
           CASE
             WHEN od.discount_id IN (2, 3) THEN od.price::numeric * od.qty * 1.4
             WHEN COALESCE(od.discount, 0) <> 0 THEN od.price::numeric * od.qty / (1 - od.discount::numeric / 100)
             ELSE od.price::numeric * od.qty
           END AS gross_sales,
           CASE
             WHEN od.discount_id IN (2, 3) THEN od.price::numeric * od.qty * 0.25
             WHEN COALESCE(od.discount, 0) <> 0 THEN od.price::numeric * od.qty * (od.discount::numeric / 100) / (1 - od.discount::numeric / 100)
             ELSE 0
           END AS discount_amount,
           -- Menu prices are VAT-inclusive, so the VAT inside what was charged is 12/112 of it.
           -- Senior Citizen / PWD lines are VAT-exempt: no VAT, but the 12/112 VAT portion of the
           -- menu price is removed (vat_exempt = gross * 12/112 = charged * 0.15) and must come off gross profit.
           CASE
             WHEN od.discount_id IN (2, 3) THEN 0
             ELSE od.price::numeric * od.qty * 12 / 112
           END AS vat,
           CASE
             WHEN od.discount_id IN (2, 3) THEN od.price::numeric * od.qty * 0.15
             ELSE 0
           END AS vat_exempt
         FROM orders o
         JOIN order_details od ON od.orderid = o.id
         WHERE o.order_date::date BETWEEN $1 AND $2
           AND o.status_id = 2
       ) line
       GROUP BY report_date
       ORDER BY report_date`,
      [start_date, end_date]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch daily sales report', detail: error.message });
  }
});

/**
 * @swagger
 * /reports/daily-sales-by-station:
 *   get:
 *     tags:
 *       - Reports
 *     summary: Get daily sales report for one station (Counter/Drinks or Kitchen), same shape and rules as /reports/daily-sales but filtered at the line-item level by the product's resolved station. A product's own `station` wins; otherwise it falls back to its category (Signature Coffee, Classic Coffee, Milk Based, Matcha Series, Garden Refresher are drinks, everything else is kitchen). Discounts are per line (order_details.discount_id/discount).
 *     parameters:
 *       - in: query
 *         name: start_date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         example: "2026-08-01"
 *       - in: query
 *         name: end_date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         example: "2026-08-05"
 *       - in: query
 *         name: station
 *         required: true
 *         schema:
 *           type: string
 *           enum: [drinks, kitchen]
 *         example: "drinks"
 *     responses:
 *       200:
 *         description: List of daily sales report rows for the requested station
 *       400:
 *         description: start_date, end_date, and station (drinks|kitchen) are required
 */
router.get('/daily-sales-by-station', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { start_date, end_date, station } = req.query;

    if (!start_date || !end_date || (station !== 'drinks' && station !== 'kitchen')) {
      return res.status(400).json({ error: "start_date, end_date, and station ('drinks' or 'kitchen') are required" });
    }

    const result = await pool.query(
      `SELECT
         report_date,
         SUM(total_serving)::int AS total_serving,
         ROUND(SUM(gross_sales)::numeric, 2) AS gross_sales,
         ROUND(SUM(food_cost)::numeric, 2) AS food_cost,
         ROUND(SUM(vat)::numeric, 2) AS vat,
         ROUND(SUM(vat_exempt)::numeric, 2) AS vat_exempt,
         ROUND(SUM(discount_amount)::numeric, 2) AS discount,
         ROUND(SUM(gross_sales) - SUM(food_cost) - SUM(discount_amount) - SUM(vat) - SUM(vat_exempt), 2) AS gross_profit
       FROM (
         SELECT
           o.order_date::date AS report_date,
           od.qty AS total_serving,
           -- COALESCE guards against a whole station/day group having only
           -- null-fc lines, which would otherwise make SUM(food_cost) (and so
           -- gross_profit) NULL for that row instead of treating it as 0 cost.
           COALESCE(od.fc::numeric, 0) * od.qty AS food_cost,
           -- od.price is the price actually charged (already net of any discount /
           -- VAT-exempt adjustment). Gross sales, discount, and VAT are derived by
           -- inverting that transformation using the line's own discount_id/discount, since it's
           -- exactly reversible. Discounts are stored per line (order_details), so each
           -- line carries exactly its own discount.
           CASE
             WHEN od.discount_id IN (2, 3) THEN od.price::numeric * od.qty * 1.4
             WHEN COALESCE(od.discount, 0) <> 0 THEN od.price::numeric * od.qty / (1 - od.discount::numeric / 100)
             ELSE od.price::numeric * od.qty
           END AS gross_sales,
           CASE
             WHEN od.discount_id IN (2, 3) THEN od.price::numeric * od.qty * 0.25
             WHEN COALESCE(od.discount, 0) <> 0 THEN od.price::numeric * od.qty * (od.discount::numeric / 100) / (1 - od.discount::numeric / 100)
             ELSE 0
           END AS discount_amount,
           -- Menu prices are VAT-inclusive, so the VAT inside what was charged is 12/112 of it.
           -- Senior Citizen / PWD lines are VAT-exempt: no VAT, but the 12/112 VAT portion of the
           -- menu price is removed (vat_exempt = gross * 12/112 = charged * 0.15) and must come off gross profit.
           CASE
             WHEN od.discount_id IN (2, 3) THEN 0
             ELSE od.price::numeric * od.qty * 12 / 112
           END AS vat,
           CASE
             WHEN od.discount_id IN (2, 3) THEN od.price::numeric * od.qty * 0.15
             ELSE 0
           END AS vat_exempt
         FROM orders o
         JOIN order_details od ON od.orderid = o.id
         LEFT JOIN product_details pd ON pd.id = od.product_details_id
         LEFT JOIN products p ON p.id = pd.productid
         LEFT JOIN category c ON c.id = p.categoryid
         WHERE o.order_date::date BETWEEN $1 AND $2
           AND o.status_id = 2
           AND COALESCE(
                 p.station,
                 CASE
                   WHEN c.name IN ('Signature Coffee', 'Classic Coffee', 'Milk Based', 'Matcha Series', 'Garden Refresher')
                     THEN 'drinks'
                   ELSE 'kitchen'
                 END
               ) = $3
       ) line
       GROUP BY report_date
       ORDER BY report_date`,
      [start_date, end_date, station]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch daily sales by station report', detail: error.message });
  }
});

module.exports = router;
