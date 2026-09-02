const express = require('express');
const router = express.Router();

/**
 * @swagger
 * /reports/daily-sales:
 *   get:
 *     tags:
 *       - Reports
 *     summary: Get daily sales report (total serving, gross sales, food cost, discount, VAT, gross profit) for a date range. Senior Citizen / PWD Privileges discounts are VAT-exempt (amount in orders is already net of VAT), so VAT is not computed for those orders.
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
         SUM(gross_sales) - SUM(food_cost) - SUM(discount_amount) - SUM(vat) AS gross_profit
       FROM (
         SELECT
           o.order_date::date AS report_date,
           od.qty AS total_serving,
           od.price::numeric * od.qty AS gross_sales,
           od.fc::numeric * od.qty AS food_cost,
           od.price::numeric * od.qty * COALESCE(o.discount, 0) / 100 AS discount_amount,
           CASE
             WHEN o.discount_id IN (2, 3) THEN 0
             ELSE (od.price::numeric * od.qty - (od.price::numeric * od.qty * COALESCE(o.discount, 0) / 100)) * 0.12
           END AS vat
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

module.exports = router;
