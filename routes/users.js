const express = require('express');
const router = express.Router();

/**
 * @swagger
 * /users:
 *   get:
 *     tags:
 *       - Users
 *     summary: Get all Users
 *     responses:
 *       200:
 *         description: List of Users
 */
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * @swagger
 * /users:
 *   post:
 *     tags:
 *       - Users
 *     summary: Create new users
 */
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { name, price } = req.body;

    const result = await pool.query(
      'INSERT INTO users (name, price) VALUES ($1, $2) RETURNING *',
      [name, price]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create users' });
  }
});

/**
 * @swagger
 * /users/login:
 *   post:
 *     tags:
 *       - Users
 *     summary: Login using username and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 example: admin
 *               password:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Invalid username or password
 */
router.post('/login', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { username, password } = req.body;

    const result = await pool.query(
      'SELECT id, username FROM users WHERE username = $1 AND password = $2',
      [username, password]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    res.json({
      message: 'Login successful',
      user: result.rows[0]
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
