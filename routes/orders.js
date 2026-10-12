const express = require('express');
const router = express.Router();
const { STOCK_REMAINING_SQL } = require('../lib/stock');

/**
 * Checks that current stock covers the whole order. Must run inside a transaction:
 * it locks the affected inventory rows (FOR UPDATE) so concurrent orders for the same
 * ingredients are serialized until COMMIT/ROLLBACK.
 * Returns null when OK, or the 409 body { message, items } when any ingredient is short.
 */
async function checkStock(client, orderDetails) {
  // Total qty per product size across all lines of the order
  const qtyByProduct = new Map();
  for (const d of orderDetails) {
    const id = Number(d.product_details_id);
    qtyByProduct.set(id, (qtyByProduct.get(id) || 0) + Number(d.qty || 0));
  }
  const productIds = [...qtyByProduct.keys()];
  const qtys = productIds.map(id => qtyByProduct.get(id));

  // Lock the inventory rows used by these product sizes (ordered by id to avoid deadlocks).
  // Product sizes with no recipe lines lock nothing and are skipped.
  const locked = await client.query(
    `SELECT i.id
     FROM inventory i
     WHERE i.id IN (
       SELECT inventory_id FROM product_details_inventory
       WHERE product_details_id = ANY($1::bigint[]) AND quantity_used > 0
     )
     ORDER BY i.id
     FOR UPDATE`,
    [productIds]
  );
  if (locked.rows.length === 0) return null;

  // Recipe lines for this order, with current remaining stock (read after the lock,
  // so it reflects any order committed by a transaction we waited on).
  const result = await client.query(
    `WITH stock AS (${STOCK_REMAINING_SQL}),
     lines AS (
       SELECT * FROM unnest($1::bigint[], $2::numeric[]) AS l(product_details_id, qty)
     )
     SELECT
       l.product_details_id,
       l.qty,
       r.inventory_id,
       r.quantity_used,
       COALESCE(st.quantity_remaining, 0) AS quantity_remaining,
       i.name AS inventory_name,
       i.unit,
       p.name AS product_name,
       s.name AS size_name
     FROM lines l
     JOIN product_details_inventory r ON r.product_details_id = l.product_details_id AND r.quantity_used > 0
     JOIN inventory i ON i.id = r.inventory_id
     LEFT JOIN stock st ON st.inventory_id = r.inventory_id
     LEFT JOIN product_details pd ON pd.id = l.product_details_id
     LEFT JOIN products p ON p.id = pd.productid
     LEFT JOIN size s ON s.id = pd.sizeid`,
    [productIds, qtys]
  );

  // Needed vs remaining per ingredient, summed across all lines (shared cups, etc.)
  const ingredients = new Map();
  const products = new Map();
  for (const row of result.rows) {
    const pdId = Number(row.product_details_id);
    const used = Number(row.quantity_used);
    const remaining = Number(row.quantity_remaining);

    const ing = ingredients.get(row.inventory_id) || {
      name: row.inventory_name, unit: row.unit, remaining, needed: 0, productIds: []
    };
    ing.needed += Number(row.qty) * used;
    ing.productIds.push(pdId);
    ingredients.set(row.inventory_id, ing);

    // Servings of this size the current stock could make on its own
    const servings = Math.max(0, Math.floor(remaining / used));
    const prod = products.get(pdId) || {
      label: [row.product_name, row.size_name].filter(Boolean).join(' ') || `Product size #${pdId}`,
      requested: Number(row.qty),
      available: servings
    };
    prod.available = Math.min(prod.available, servings);
    products.set(pdId, prod);
  }

  // Small epsilon guards against float error with fractional recipe quantities
  const short = [...ingredients.values()].filter(ing => ing.needed > ing.remaining + 1e-9);
  if (short.length === 0) return null;

  const affectedIds = [...new Set(short.flatMap(ing => ing.productIds))];
  const items = affectedIds.map(id => ({
    product_details_id: id,
    requested: products.get(id).requested,
    available: products.get(id).available
  }));

  // Prefer naming a single product that alone exceeds stock; otherwise explain the shared ingredient.
  const overOnItsOwn = items.find(it => it.requested > it.available);
  let message;
  if (overOnItsOwn) {
    const p = products.get(overOnItsOwn.product_details_id);
    message = `Not enough stock: ${p.label} has only ${p.available} left.`;
  } else {
    const ing = short[0];
    const labels = [...new Set(ing.productIds)].map(id => products.get(id).label);
    const unit = ing.unit ? ` ${ing.unit}` : '';
    message = `Not enough stock: ${labels.join(' and ')} together need ${ing.needed}${unit} of ${ing.name}, ` +
      `but only ${Math.max(0, ing.remaining)}${unit} left.`;
  }

  return { message, items };
}

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
             'fc',                 od.fc,
             'discount_id',        od.discount_id,
             'discount',           od.discount
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
         od.discount_id,
         od.discount,
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
             'fc',                od.fc,
             'discount_id',       od.discount_id,
             'discount',          od.discount
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
 *                     discount_id:
 *                       type: integer
 *                       description: Discount for this line only (FK to discount.id). Lines without discount_id/discount fall back to the order-level discount_id/discount.
 *                       example: 2
 *                     discount:
 *                       type: number
 *                       description: Discount percentage for this line (e.g. 20.00 = 20%)
 *                       example: 20.00
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: order_details must be a non-empty array
 *       409:
 *         description: Not enough stock for one or more items; order not created. Body is { message, items[] }
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

    const shortage = await checkStock(client, order_details);
    if (shortage) {
      await client.query('ROLLBACK');
      return res.status(409).json(shortage);
    }

    const orderResult = await client.query(
      `INSERT INTO orders (name, order_date, payment_type_id, status_id, remarks, discount_id, discount)
       VALUES ($1, NOW(), $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, payment_type_id, status_id ?? null, remarks ?? null, discount_id ?? null, discount ?? null]
    );
    const order = orderResult.rows[0];

    // Discounts are stored per line. A line without its own discount fields falls back
    // to the order-level discount (older clients send only that, applied to every line).
    const lineHasOwnDiscount = order_details.some(d => 'discount_id' in d || 'discount' in d);

    const insertedDetails = [];
    for (const detail of order_details) {
      const lineDiscountId = lineHasOwnDiscount ? (detail.discount_id ?? null) : (discount_id ?? null);
      const lineDiscount = lineHasOwnDiscount ? (detail.discount ?? null) : (discount ?? null);
      const detailResult = await client.query(
        `INSERT INTO order_details (orderid, product_details_id, qty, price, fc, discount_id, discount)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [order.id, detail.product_details_id, detail.qty, detail.price, detail.fc ?? null, lineDiscountId, lineDiscount]
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
