const express = require('express');
const router = express.Router();

/**
 * @swagger
 * /products:
 *   get:
 *     tags:
 *       - Products
 *     summary: Get all products
 *     responses:
 *       200:
 *         description: List of products
 */
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(`SELECT
          p.id,
          p.name,
          p.categoryid,
          MAX(pd.image_url) AS image_url,
          MAX(pd.price) AS price,
          a.name AS "categoryName",
          STRING_AGG(s.name, ', ') AS sizes
          FROM products p
          LEFT JOIN product_details pd ON pd.productid = p.id
          JOIN category a ON p.categoryid = a.id
          LEFT JOIN size s ON pd.sizeid = s.id
          GROUP BY p.id, p.name, p.categoryid, a.name`
    );

    res.json(result.rows);

  } catch (error) {
    console.error("Products API error:", error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/**
 * @swagger
 * /products:
 *   post:
 *     tags:
 *       - Products
 *     summary: Create a new product
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - categoryid
 *             properties:
 *               name:
 *                 type: string
 *                 example: MATCHA LATTE
 *               categoryid:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       201:
 *         description: Product created successfully
 *       400:
 *         description: name and categoryid are required
 *       500:
 *         description: Failed to create product
 */
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { name, categoryid } = req.body;

    if (!name || categoryid === undefined || categoryid === null) {
      return res.status(400).json({ error: 'name and categoryid are required' });
    }

    const result = await pool.query(
      'INSERT INTO products (name, categoryid) VALUES ($1, $2) RETURNING *',
      [name, categoryid]
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     tags:
 *       - Products
 *     summary: Delete a product by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: Product deleted successfully
 *       404:
 *         description: Product not found
 *       409:
 *         description: Product has existing product details/orders and cannot be deleted
 *       500:
 *         description: Failed to delete product
 */
router.delete('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { id } = req.params;

    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ message: 'Product removed', removed: result.rows[0] });

  } catch (error) {
    console.error(error);

    if (error.code === '23503') {
      return res.status(409).json({
        error: 'Cannot delete product: it still has product details (sizes/prices) or orders referencing it',
        detail: error.message
      });
    }

    res.status(500).json({ error: 'Failed to delete product', detail: error.message });
  }
});

/**
 * @swagger
 * /products/price:
 *   get:
 *     tags:
 *       - Products
 *     summary: Get all product prices
 *     responses:
 *       200:
 *         description: List of product prices
 */
router.get('/price', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query('SELECT * FROM product_price');
    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch product price' });
  }
});

/**
 * @swagger
 * /products/price:
 *   post:
 *     tags:
 *       - Products
 *     summary: Create new product price
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *     responses:
 *       200:
 *         description: Product price created successfully
 *       500:
 *         description: Failed to create product size
 */
router.post('/price', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { name, price } = req.body;

    const result = await pool.query(
      'INSERT INTO size (name, price) VALUES ($1, $2) RETURNING *',
      [name, price]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create product size' });
  }
});

/**
 * @swagger
 * /products/size:
 *   get:
 *     tags:
 *       - Products
 *     summary: Get all sizes
 *     responses:
 *       200:
 *         description: List of sizes
 */
router.get('/size', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query('SELECT * FROM size');
    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch product size' });
  }
});

/**
 * @swagger
 * /products/size:
 *   post:
 *     tags:
 *       - Products
 *     summary: Create new size
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *     responses:
 *       200:
 *         description: Size created successfully
 *       500:
 *         description: Failed to create size
 */
router.post('/size', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { name, price } = req.body;

    const result = await pool.query(
      'INSERT INTO size (name, price) VALUES ($1, $2) RETURNING *',
      [name, price]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create size' });
  }
});

module.exports = router;
