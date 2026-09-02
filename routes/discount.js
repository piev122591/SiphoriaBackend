const express = require('express');
const router = express.Router();

/**
 * @swagger
 * /discount:
 *   get:
 *     tags:
 *       - Discount
 *     summary: Get all discount
 *     responses:
 *       200:
 *         description: List of discount
 */
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query('SELECT * FROM discount');
    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch discount' });
  }
});

/**
 * @swagger
 * /discount:
 *   post:
 *     tags:
 *       - Discount
 *     summary: Create new discount
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: 10% Off
 *               description:
 *                 type: string
 *                 example: Ten percent off entire order
 */
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { name, description } = req.body;

    const result = await pool.query(
      'INSERT INTO discount (name, description) VALUES ($1, $2) RETURNING *',
      [name, description ?? null]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create discount' });
  }
});

module.exports = router;
