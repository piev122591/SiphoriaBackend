const express = require('express');
const router = express.Router();

/**
 * @swagger
 * /inventory:
 *   get:
 *     tags:
 *       - Inventory
 *     summary: Get all inventory items, with quantity_remaining computed from Completed orders
 *     responses:
 *       200:
 *         description: List of inventory items
 */
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(`
      WITH consumed AS (
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
        i.quantity,
        COALESCE(consumed.total_used, 0) AS consumed,
        i.quantity - COALESCE(consumed.total_used, 0) AS quantity_remaining,
        i.reorder_level,
        i.updated_at
      FROM inventory i
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
 *     summary: Create a new inventory item
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
 *               quantity:
 *                 type: number
 *                 example: 100
 *               reorder_level:
 *                 type: number
 *                 example: 20
 *     responses:
 *       201:
 *         description: Inventory item created successfully
 *       400:
 *         description: name is required
 *       500:
 *         description: Failed to create inventory item
 */
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { name, unit, quantity, reorder_level } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const result = await pool.query(
      `INSERT INTO inventory (name, unit, quantity, reorder_level)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, unit || 'pcs', quantity ?? 0, reorder_level ?? null]
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create inventory item' });
  }
});

/**
 * @swagger
 * /inventory/{id}/quantity:
 *   patch:
 *     tags:
 *       - Inventory
 *     summary: Set the stock quantity of an inventory item (restock/adjustment)
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
 *                 example: 150
 *     responses:
 *       200:
 *         description: Quantity updated successfully
 *       400:
 *         description: quantity is required
 *       404:
 *         description: Inventory item not found
 *       500:
 *         description: Failed to update quantity
 */
router.patch('/:id/quantity', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { id } = req.params;
    const { quantity } = req.body;

    if (quantity === undefined || quantity === null) {
      return res.status(400).json({ error: 'quantity is required' });
    }

    const result = await pool.query(
      `UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [quantity, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update quantity', detail: error.message });
  }
});

/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     tags:
 *       - Inventory
 *     summary: Update an inventory item by ID
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
      `WITH consumed AS (
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
         i.quantity AS inventory_quantity,
         i.quantity - COALESCE(consumed.total_used, 0) AS inventory_quantity_remaining
       FROM product_details_inventory pdi
       JOIN inventory i ON i.id = pdi.inventory_id
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
