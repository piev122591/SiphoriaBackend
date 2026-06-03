const express = require('express');
const router = express.Router();

/**
 * @swagger
 * /orders:
 *   get:
 *     tags:
 *       - Orders
 *     summary: Get all Orders
 *     responses:
 *       200:
 *         description: List of Orders
 */
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query('SELECT * FROM orders');
    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

/**
 * @swagger
 * /orders/{id}:
 *   get:
 *     tags:
 *       - Orders
 *     summary: Get order with its details by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Order with details
 *       404:
 *         description: Order not found
 */
/**
 * @swagger
 * /orders/by-date:
 *   get:
 *     tags:
 *       - Orders
 *     summary: Get orders with order details filtered by date range
 *     parameters:
 *       - in: query
 *         name: start_date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         example: "2025-01-01"
 *       - in: query
 *         name: end_date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         example: "2025-12-31"
 *     responses:
 *       200:
 *         description: List of orders with their details
 *       400:
 *         description: start_date and end_date are required
 */
router.get('/by-date', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date are required' });
    }

    const result = await pool.query(
      `SELECT
         o.id,
         o.name,
         o.order_date,
         o.payment_type_id,
         o.status_id,
         o.remarks,
         JSON_AGG(
           JSON_BUILD_OBJECT(
             'id',        od.id,
             'productid', od.productid,
             'qty',       od.qty,
             'price',     od.price
           )
         ) AS order_details
       FROM orders o
       JOIN order_details od ON od.orderid = o.id
       WHERE o.order_date::date BETWEEN $1 AND $2
       GROUP BY o.id, o.name, o.order_date, o.payment_type_id, o.status_id, o.remarks
       ORDER BY o.order_date DESC`,
      [start_date, end_date]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch orders by date range' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { id } = req.params;

    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const detailsResult = await pool.query(
      'SELECT * FROM order_details WHERE orderid = $1',
      [id]
    );

    res.json({
      ...orderResult.rows[0],
      order_details: detailsResult.rows
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

/**
 * @swagger
 * /orders:
 *   post:
 *     tags:
 *       - Orders
 *     summary: Create a new order with order details
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - payment_type_id
 *               - order_details
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               payment_type_id:
 *                 type: integer
 *                 example: 1
 *               status_id:
 *                 type: integer
 *                 example: 1
 *               remarks:
 *                 type: string
 *                 example: Extra sugar please
 *               order_details:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - productid
 *                     - qty
 *                     - price
 *                   properties:
 *                     productid:
 *                       type: integer
 *                       example: 1
 *                     qty:
 *                       type: integer
 *                       example: 2
 *                     price:
 *                       type: number
 *                       example: 150.00
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: order_details must be a non-empty array
 *       500:
 *         description: Failed to create order
 */
router.post('/', async (req, res) => {
  const pool = req.app.locals.pool;
  const { name, payment_type_id, status_id, remarks, order_details } = req.body;

  if (!Array.isArray(order_details) || order_details.length === 0) {
    return res.status(400).json({ error: 'order_details must be a non-empty array' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `INSERT INTO orders (name, order_date, payment_type_id, status_id, remarks)
       VALUES ($1, NOW(), $2, $3, $4)
       RETURNING *`,
      [name, payment_type_id, status_id ?? null, remarks ?? null]
    );
    const order = orderResult.rows[0];

    const insertedDetails = [];
    for (const detail of order_details) {
      const detailResult = await client.query(
        `INSERT INTO order_details (orderid, productid, qty, price)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [order.id, detail.productid, detail.qty, detail.price]
      );
      insertedDetails.push(detailResult.rows[0]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      ...order,
      order_details: insertedDetails
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Failed to create order', detail: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;
