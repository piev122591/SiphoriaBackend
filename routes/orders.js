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
         o.discount_id,
         o.discount,
         SUM(od.price * od.qty) AS total,
         JSON_AGG(
           JSON_BUILD_OBJECT(
             'id',        od.id,
             'product_details_id', od.product_details_id,
             'qty',                od.qty,
             'price',              od.price,
             'fc',                 od.fc
           )
         ) AS order_details
       FROM orders o
       JOIN order_details od ON od.orderid = o.id
       WHERE o.order_date::date BETWEEN $1 AND $2
       GROUP BY o.id, o.name, o.order_date, o.payment_type_id, o.status_id, o.remarks, o.discount_id, o.discount
       ORDER BY o.order_date DESC`,
      [start_date, end_date]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch orders by date range' });
  }
});

/**
 * @swagger
 * /orders/order-details/{id}:
 *   get:
 *     tags:
 *       - Orders
 *     summary: Get order details by order ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: List of order details for the given order
 *       404:
 *         description: No order details found
 */
router.get('/order-details/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
         od.id,
         od.orderid,
         od.product_details_id,
         od.qty,
         od.price,
         od.fc,
         pd.sizeid,
         s.name AS size_name,
         p.name AS product_name
       FROM order_details od
       LEFT JOIN product_details pd ON pd.id = od.product_details_id
       LEFT JOIN size s ON s.id = pd.sizeid
       LEFT JOIN products p ON p.id = pd.productid
       WHERE od.orderid = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No order details found for this order' });
    }

    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch order details', detail: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}:
 *   get:
 *     tags:
 *       - Orders
 *     summary: Get order with order details by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: Order with details and total
 *       404:
 *         description: Order not found
 */
router.get('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
         o.id,
         o.name,
         o.order_date,
         o.payment_type_id,
         o.status_id,
         o.remarks,
         o.discount_id,
         o.discount,
         SUM(od.price * od.qty) AS total,
         JSON_AGG(
           JSON_BUILD_OBJECT(
             'id',                od.id,
             'product_details_id', od.product_details_id,
             'qty',               od.qty,
             'price',             od.price,
             'fc',                od.fc
           )
         ) AS order_details
       FROM orders o
       JOIN order_details od ON od.orderid = o.id
       WHERE o.id = $1
       GROUP BY o.id, o.name, o.order_date, o.payment_type_id, o.status_id, o.remarks, o.discount_id, o.discount`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch order', detail: error.message });
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
 *               discount_id:
 *                 type: integer
 *                 example: 1
 *               discount:
 *                 type: number
 *                 example: 10.00
 *               order_details:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - product_details_id
 *                     - qty
 *                     - price
 *                   properties:
 *                     product_details_id:
 *                       type: integer
 *                       example: 1
 *                     qty:
 *                       type: integer
 *                       example: 2
 *                     price:
 *                       type: number
 *                       example: 150.00
 *                     fc:
 *                       type: number
 *                       example: 35.50
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
  const { name, payment_type_id, status_id, remarks, discount_id, discount, order_details } = req.body;

  if (!Array.isArray(order_details) || order_details.length === 0) {
    return res.status(400).json({ error: 'order_details must be a non-empty array' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `INSERT INTO orders (name, order_date, payment_type_id, status_id, remarks, discount_id, discount)
       VALUES ($1, NOW(), $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, payment_type_id, status_id ?? null, remarks ?? null, discount_id ?? null, discount ?? null]
    );
    const order = orderResult.rows[0];

    const insertedDetails = [];
    for (const detail of order_details) {
      const detailResult = await client.query(
        `INSERT INTO order_details (orderid, product_details_id, qty, price, fc)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [order.id, detail.product_details_id, detail.qty, detail.price, detail.fc ?? null]
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

/**
 * @swagger
 * /orders/{id}/status:
 *   patch:
 *     tags:
 *       - Orders
 *     summary: Update order status by order ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status_id
 *             properties:
 *               status_id:
 *                 type: integer
 *                 example: 2
 *     responses:
 *       200:
 *         description: Order status updated successfully
 *       400:
 *         description: status_id is required
 *       404:
 *         description: Order not found
 *       500:
 *         description: Failed to update order status
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { id } = req.params;
    const { status_id } = req.body;

    if (status_id === undefined || status_id === null) {
      return res.status(400).json({ error: 'status_id is required' });
    }

    const result = await pool.query(
      `UPDATE orders SET status_id = $1 WHERE id = $2 RETURNING *`,
      [status_id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update order status', detail: error.message });
  }
});

module.exports = router;
