const express = require('express');
const router = express.Router();

/**
 * @swagger
 * /payment_type:
 *   get:
 *     tags:
 *       - Payment Type
 *     summary: Get all payment_type
 *     responses:
 *       200:
 *         description: List of payment type
 */
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query('SELECT * FROM payment_type');
    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch payment_type' });
  }
});

/**
 * @swagger
 * /payment_type:
 *   post:
 *     tags:
 *       - Payment Type
 *     summary: Create new payment type
 */
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { name, price } = req.body;

    const result = await pool.query(
      'INSERT INTO payment_type (name, price) VALUES ($1, $2) RETURNING *',
      [name, price]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create payment_type' });
  }
});

module.exports = router;
