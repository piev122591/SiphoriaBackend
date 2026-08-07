const express = require('express');
const router = express.Router();

/**
 * @swagger
 * /reports/daily-sales:
 *   get:
 *     tags:
 *       - Reports
 *     summary: Get daily sales report (total serving, gross sales, food cost, VAT, gross profit) for a date range
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
         o.order_date::date AS report_date,
         SUM(od.qty) AS total_serving,
         SUM(od.price::numeric * od.qty) AS gross_sales,
         SUM(od.fc::numeric * od.qty) AS food_cost,
         SUM(od.price::numeric * od.qty) * 0.12 AS vat,
         SUM(od.price::numeric * od.qty) - SUM(od.fc::numeric * od.qty) - (SUM(od.price::numeric * od.qty) * 0.12) AS gross_profit
       FROM orders o
       JOIN order_details od ON od.orderid = o.id
       WHERE o.order_date::date BETWEEN $1 AND $2
       GROUP BY o.order_date::date
       ORDER BY o.order_date::date`,
      [start_date, end_date]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch daily sales report', detail: error.message });
  }
});

module.exports = router;
