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

    const result = await pool.query('SELECT * FROM products');
    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/**
 * @swagger
 * /products:
 *   post:
 *     tags:
 *       - Products
 *     summary: Create new product
 */
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { name, price } = req.body;

    const result = await pool.query(
      'INSERT INTO products (name, price) VALUES ($1, $2) RETURNING *',
      [name, price]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

module.exports = router;
