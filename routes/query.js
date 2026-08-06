const express = require('express');
const router = express.Router();

const DESTRUCTIVE = /^\s*(DELETE|UPDATE|DROP|TRUNCATE|ALTER)\b/i;

/**
 * @swagger
 * /query:
 *   post:
 *     tags:
 *       - Query
 *     summary: Run an ad-hoc SQL statement
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sql
 *             properties:
 *               sql:
 *                 type: string
 *                 example: SELECT * FROM orders
 *               confirm:
 *                 type: boolean
 *                 description: Required (true) to run DELETE/UPDATE/DROP/TRUNCATE/ALTER statements
 *                 example: false
 *     responses:
 *       200:
 *         description: Query executed successfully
 *       400:
 *         description: sql is required, or a destructive statement was sent without confirm
 *       500:
 *         description: Query failed
 */
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { sql, confirm } = req.body;

    if (!sql || typeof sql !== 'string' || !sql.trim()) {
      return res.status(400).json({ error: 'sql is required' });
    }

    if (DESTRUCTIVE.test(sql) && confirm !== true) {
      return res.status(400).json({
        error: 'This looks like a destructive statement (DELETE/UPDATE/DROP/TRUNCATE/ALTER). Resend with "confirm": true to run it.'
      });
    }

    const result = await pool.query(sql);

    res.json({
      command: result.command,
      rowCount: result.rowCount,
      rows: result.rows
    });

  } catch (error) {
    console.error('Ad-hoc query failed:', error);
    res.status(500).json({ error: 'Query failed', detail: error.message });
  }
});

module.exports = router;
