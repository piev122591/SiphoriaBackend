const express = require('express');
const router = express.Router();

/**
 * @swagger
 * /inventory:
 *   get:
 *     tags:
 *       - Inventory
 *     summary: Get all inventory items, with quantity (total stocked-in) and quantity_remaining computed
 *     responses:
 *       200:
 *         description: List of inventory items
 */
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(`
      WITH stocked AS (
        SELECT inventory_id, SUM(quantity) AS total_stocked
        FROM inventory_details
        GROUP BY inventory_id
      ),
      consumed AS (
        SELECT pdi.inventory_id, SUM(pdi.quantity_used * od.qty) AS total_used
        FROM product_details_inventory pdi
        JOIN order_details od ON od.product_details_id = pdi.product_details_id
        JOIN orders o ON o.id = od.orderid
        WHERE o.status_id = 2
        GROUP BY pdi.inventory_id
      )
      SELECT
        i.id,
        i.name,
        i.unit,
        COALESCE(stocked.total_stocked, 0) AS quantity,
        COALESCE(consumed.total_used, 0) AS consumed,
        COALESCE(stocked.total_stocked, 0) - COALESCE(consumed.total_used, 0) AS quantity_remaining,
        i.reorder_level,
        i.updated_at
      FROM inventory i
      LEFT JOIN stocked ON stocked.inventory_id = i.id
      LEFT JOIN consumed ON consumed.inventory_id = i.id
      ORDER BY i.name
    `);

    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

/**
 * @swagger
 * /inventory:
 *   post:
 *     tags:
 *       - Inventory
 *     summary: Create a new inventory item, optionally with an opening stock record
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
 *                 example: 16oz Cup
 *               unit:
 *                 type: string
 *                 example: pcs
 *               reorder_level:
 *                 type: number
 *                 example: 20
 *               quantity:
 *                 type: number
 *                 description: Optional opening stock -- recorded as the first inventory_details row
 *                 example: 100
 *     responses:
 *       201:
 *         description: Inventory item created successfully
 *       400:
 *         description: name is required
 *       500:
 *         description: Failed to create inventory item
 */
router.post('/', async (req, res) => {
  const pool = req.app.locals.pool;
  const { name, unit, reorder_level, quantity } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const itemResult = await client.query(
      `INSERT INTO inventory (name, unit, reorder_level)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, unit || 'pcs', reorder_level ?? null]
    );
    const item = itemResult.rows[0];

    if (quantity !== undefined && quantity !== null && Number(quantity) !== 0) {
      await client.query(
        `INSERT INTO inventory_details (inventory_id, quantity, note)
         VALUES ($1, $2, $3)`,
        [item.id, quantity, 'Initial stock']
      );
    }

    await client.query('COMMIT');

    res.status(201).json(item);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Failed to create inventory item', detail: error.message });
  } finally {
    client.release();
  }
});

/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     tags:
 *       - Inventory
 *     summary: Update an inventory item's metadata by ID
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
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: 16oz Cup
 *               unit:
 *                 type: string
 *                 example: pcs
 *               reorder_level:
 *                 type: number
 *                 example: 20
 *     responses:
 *       200:
 *         description: Inventory item updated successfully
 *       400:
 *         description: name is required
 *       404:
 *         description: Inventory item not found
 *       500:
 *         description: Failed to update inventory item
 */
router.put('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { id } = req.params;
    const { name, unit, reorder_level } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const result = await pool.query(
      `UPDATE inventory SET name = $1, unit = $2, reorder_level = $3, updated_at = NOW() WHERE id = $4 RETURNING *`,
      [name, unit || 'pcs', reorder_level ?? null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update inventory item', detail: error.message });
  }
});

/**
 * @swagger
 * /inventory/{id}/details:
 *   get:
 *     tags:
 *       - Inventory
 *     summary: Get the stock-in history (restocks) for an inventory item
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: List of stock-in records for the item
 */
router.get('/:id/details', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, inventory_id, quantity, note, created_at
       FROM inventory_details
       WHERE inventory_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch stock-in history', detail: error.message });
  }
});

/**
 * @swagger
 * /inventory/{id}/details:
 *   post:
 *     tags:
 *       - Inventory
 *     summary: Record a new stock-in (restock) event for an inventory item
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
 *               - quantity
 *             properties:
 *               quantity:
 *                 type: number
 *                 example: 50
 *               note:
 *                 type: string
 *                 example: Weekly delivery
 *     responses:
 *       201:
 *         description: Stock-in record created successfully
 *       400:
 *         description: quantity is required
 *       404:
 *         description: Inventory item not found
 *       500:
 *         description: Failed to record stock-in
 */
router.post('/:id/details', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { id } = req.params;
    const { quantity, note } = req.body;

    if (quantity === undefined || quantity === null) {
      return res.status(400).json({ error: 'quantity is required' });
    }

    const itemCheck = await pool.query('SELECT id FROM inventory WHERE id = $1', [id]);
    if (itemCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    const result = await pool.query(
      `INSERT INTO inventory_details (inventory_id, quantity, note)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, quantity, note ?? null]
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to record stock-in', detail: error.message });
  }
});

/**
 * @swagger
 * /inventory/{id}/details/{detail_id}:
 *   patch:
 *     tags:
 *       - Inventory
 *     summary: Correct a stock-in record (wrong quantity, wrong note) for an inventory item
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *       - in: path
 *         name: detail_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 3
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quantity:
 *                 type: number
 *                 example: 40
 *               note:
 *                 type: string
 *                 example: Corrected count
 *     responses:
 *       200:
 *         description: Stock-in record updated successfully
 *       400:
 *         description: quantity or note is required
 *       404:
 *         description: Stock-in record not found
 *       500:
 *         description: Failed to update stock-in record
 */
router.patch('/:id/details/:detail_id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { id, detail_id } = req.params;
    const { quantity, note } = req.body;

    if (quantity === undefined && note === undefined) {
      return res.status(400).json({ error: 'quantity or note is required' });
    }

    const result = await pool.query(
      `UPDATE inventory_details
       SET quantity = COALESCE($1, quantity),
           note = COALESCE($2, note)
       WHERE id = $3 AND inventory_id = $4
       RETURNING *`,
      [quantity ?? null, note ?? null, detail_id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Stock-in record not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update stock-in record', detail: error.message });
  }
});

/**
 * @swagger
 * /inventory/{id}/details/{detail_id}:
 *   delete:
 *     tags:
 *       - Inventory
 *     summary: Remove a stock-in record (e.g. added by mistake) from an inventory item
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *       - in: path
 *         name: detail_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 3
 *     responses:
 *       200:
 *         description: Stock-in record removed successfully
 *       404:
 *         description: Stock-in record not found
 *       500:
 *         description: Failed to remove stock-in record
 */
router.delete('/:id/details/:detail_id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { id, detail_id } = req.params;

    const result = await pool.query(
      `DELETE FROM inventory_details
       WHERE id = $1 AND inventory_id = $2
       RETURNING *`,
      [detail_id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Stock-in record not found' });
    }

    res.json({ message: 'Stock-in record removed', removed: result.rows[0] });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to remove stock-in record', detail: error.message });
  }
});

/**
 * @swagger
 * /inventory/product-details/{product_details_id}:
 *   get:
 *     tags:
 *       - Inventory
 *     summary: Get the recipe (inventory items consumed) for a product detail (size SKU)
 *     parameters:
 *       - in: path
 *         name: product_details_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: List of recipe lines for the given product detail
 */
router.get('/product-details/:product_details_id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { product_details_id } = req.params;

    const result = await pool.query(
      `WITH stocked AS (
         SELECT inventory_id, SUM(quantity) AS total_stocked
         FROM inventory_details
         GROUP BY inventory_id
       ),
       consumed AS (
         SELECT pdi2.inventory_id, SUM(pdi2.quantity_used * od.qty) AS total_used
         FROM product_details_inventory pdi2
         JOIN order_details od ON od.product_details_id = pdi2.product_details_id
         JOIN orders o ON o.id = od.orderid
         WHERE o.status_id = 2
         GROUP BY pdi2.inventory_id
       )
       SELECT
         pdi.id,
         pdi.product_details_id,
         pdi.inventory_id,
         pdi.quantity_used,
         i.name AS inventory_name,
         i.unit AS inventory_unit,
         COALESCE(stocked.total_stocked, 0) AS inventory_quantity,
         COALESCE(stocked.total_stocked, 0) - COALESCE(consumed.total_used, 0) AS inventory_quantity_remaining
       FROM product_details_inventory pdi
       JOIN inventory i ON i.id = pdi.inventory_id
       LEFT JOIN stocked ON stocked.inventory_id = i.id
       LEFT JOIN consumed ON consumed.inventory_id = i.id
       WHERE pdi.product_details_id = $1
       ORDER BY i.name`,
      [product_details_id]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch recipe', detail: error.message });
  }
});

/**
 * @swagger
 * /inventory/product-details/{product_details_id}:
 *   post:
 *     tags:
 *       - Inventory
 *     summary: Add a recipe line (inventory item consumed) to a product detail (size SKU)
 *     parameters:
 *       - in: path
 *         name: product_details_id
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
 *               - inventory_id
 *             properties:
 *               inventory_id:
 *                 type: integer
 *                 example: 1
 *               quantity_used:
 *                 type: number
 *                 example: 1
 *     responses:
 *       201:
 *         description: Recipe line created successfully
 *       400:
 *         description: inventory_id is required
 *       500:
 *         description: Failed to create recipe line
 */
router.post('/product-details/:product_details_id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { product_details_id } = req.params;
    const { inventory_id, quantity_used } = req.body;

    if (!inventory_id) {
      return res.status(400).json({ error: 'inventory_id is required' });
    }

    const result = await pool.query(
      `INSERT INTO product_details_inventory (product_details_id, inventory_id, quantity_used)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [product_details_id, inventory_id, quantity_used ?? 1]
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create recipe line', detail: error.message });
  }
});

/**
 * @swagger
 * /inventory/product-details/{product_details_id}/{inventory_id}:
 *   patch:
 *     tags:
 *       - Inventory
 *     summary: Update the quantity_used of a recipe line
 *     parameters:
 *       - in: path
 *         name: product_details_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *       - in: path
 *         name: inventory_id
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
 *               - quantity_used
 *             properties:
 *               quantity_used:
 *                 type: number
 *                 example: 2
 *     responses:
 *       200:
 *         description: Recipe line updated successfully
 *       400:
 *         description: quantity_used is required
 *       404:
 *         description: Recipe line not found
 *       500:
 *         description: Failed to update recipe line
 */
router.patch('/product-details/:product_details_id/:inventory_id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { product_details_id, inventory_id } = req.params;
    const { quantity_used } = req.body;

    if (quantity_used === undefined || quantity_used === null) {
      return res.status(400).json({ error: 'quantity_used is required' });
    }

    const result = await pool.query(
      `UPDATE product_details_inventory
       SET quantity_used = $1
       WHERE product_details_id = $2 AND inventory_id = $3
       RETURNING *`,
      [quantity_used, product_details_id, inventory_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recipe line not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update recipe line', detail: error.message });
  }
});

/**
 * @swagger
 * /inventory/product-details/{product_details_id}/{inventory_id}:
 *   delete:
 *     tags:
 *       - Inventory
 *     summary: Remove a recipe line from a product detail
 *     parameters:
 *       - in: path
 *         name: product_details_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *       - in: path
 *         name: inventory_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: Recipe line removed successfully
 *       404:
 *         description: Recipe line not found
 *       500:
 *         description: Failed to remove recipe line
 */
router.delete('/product-details/:product_details_id/:inventory_id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { product_details_id, inventory_id } = req.params;

    const result = await pool.query(
      `DELETE FROM product_details_inventory
       WHERE product_details_id = $1 AND inventory_id = $2
       RETURNING *`,
      [product_details_id, inventory_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recipe line not found' });
    }

    res.json({ message: 'Recipe line removed', removed: result.rows[0] });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to remove recipe line', detail: error.message });
  }
});

module.exports = router;
