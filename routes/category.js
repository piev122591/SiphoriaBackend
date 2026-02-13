const express = require('express');
const router = express.Router();

/**
 * @swagger
 * /category:
 *   get:
 *     tags:
 *       - Category
 *     summary: Get all category
 *     responses:
 *       200:
 *         description: List of category
 */
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query('SELECT * FROM category');
    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

/**
 * @swagger
 * /category:
 *   post:
 *     tags:
 *       - Category
 *     summary: Create new category
 */
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { name, price } = req.body;

    const result = await pool.query(
      'INSERT INTO category (name, price) VALUES ($1, $2) RETURNING *',
      [name, price]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

module.exports = router;
