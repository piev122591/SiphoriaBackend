const express = require('express');
const router = express.Router();


  /**
 * @swagger
 * /productDetails:
 *   get:
 *     tags:
 *       - Product Details
 *     summary: Get all product details
 */
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(`SELECT pd.id,
          p.id As "productId",
          p.name,
          p.categoryid,
          pd.image_url,
          pd.price,
          pd.fc,
          a.name AS "categoryName",
          s.name as "size"
          FROM products p
          JOIN product_details pd ON pd.productid = p.id
          JOIN category a ON p.categoryid = a.id
          JOIN size s ON pd.sizeid = s.id
          `);

    res.json(result.rows);

  } catch (error) {
    console.error("Product Details API error:", error);
    res.status(500).json({ error: 'Failed to fetch product details' });
  }
});




/**
 * @swagger
 * /productDetails:
 *   post:
 *     tags:
 *       - Product Details
 *     summary: Add new product detail
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productid
 *               - sizeid
 *               - price
 *             properties:
 *               productid:
 *                 type: integer
 *                 example: 1
 *               sizeid:
 *                 type: integer
 *                 example: 2
 *               price:
 *                 type: number
 *                 example: 110
 *               fc:
 *                 type: number
 *                 example: 35.50
 *               image_url:
 *                 type: string
 *                 example: https://example.com/image.png
 *     responses:
 *       201:
 *         description: Product detail created successfully
 *       400:
 *         description: productid, sizeid, and price are required
 *       500:
 *         description: Failed to create product detail
 */
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { productid, sizeid, price, fc, image_url } = req.body;

    if (!productid || !sizeid || price === undefined || price === null) {
      return res.status(400).json({ error: 'productid, sizeid, and price are required' });
    }

    const result = await pool.query(
      'INSERT INTO product_details (productid, sizeid, price, fc, image_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [productid, sizeid, price, fc ?? null, image_url || null]
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create product detail' });
  }
});

/**
 * @swagger
 * /productDetails/{id}/price:
 *   patch:
 *     tags:
 *       - Product Details
 *     summary: Update price of a product detail by ID
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
 *               - price
 *             properties:
 *               price:
 *                 type: number
 *                 example: 150.00
 *     responses:
 *       200:
 *         description: Price updated successfully
 *       400:
 *         description: price is required
 *       404:
 *         description: Product detail not found
 *       500:
 *         description: Failed to update price
 */
router.patch('/:id/price', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { id } = req.params;
    const { price } = req.body;

    if (price === undefined || price === null) {
      return res.status(400).json({ error: 'price is required' });
    }

    const result = await pool.query(
      `UPDATE product_details SET price = $1 WHERE id = $2 RETURNING *`,
      [price, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product detail not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update price', detail: error.message });
  }
});

/**
 * @swagger
 * /productDetails/{id}:
 *   put:
 *     tags:
 *       - Product Details
 *     summary: Update a product detail by ID
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
 *               - productid
 *               - sizeid
 *               - price
 *             properties:
 *               productid:
 *                 type: integer
 *                 example: 1
 *               sizeid:
 *                 type: integer
 *                 example: 2
 *               price:
 *                 type: number
 *                 example: 110
 *               fc:
 *                 type: number
 *                 example: 35.50
 *               image_url:
 *                 type: string
 *                 example: https://example.com/image.png
 *     responses:
 *       200:
 *         description: Product detail updated successfully
 *       400:
 *         description: productid, sizeid, and price are required
 *       404:
 *         description: Product detail not found
 *       500:
 *         description: Failed to update product detail
 */
router.put('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { id } = req.params;
    const { productid, sizeid, price, fc, image_url } = req.body;

    if (!productid || !sizeid || price === undefined || price === null) {
      return res.status(400).json({ error: 'productid, sizeid, and price are required' });
    }

    const result = await pool.query(
      `UPDATE product_details SET productid = $1, sizeid = $2, price = $3, fc = $4, image_url = $5 WHERE id = $6 RETURNING *`,
      [productid, sizeid, price, fc ?? null, image_url || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product detail not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update product detail', detail: error.message });
  }
});

/**
 * @swagger
 * /productDetails/{id}:
 *   delete:
 *     tags:
 *       - Product Details
 *     summary: Delete a product detail (size/SKU) by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: Product detail deleted successfully
 *       404:
 *         description: Product detail not found
 *       409:
 *         description: Product detail has existing recipe lines/orders and cannot be deleted
 *       500:
 *         description: Failed to delete product detail
 */
router.delete('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { id } = req.params;

    const result = await pool.query('DELETE FROM product_details WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product detail not found' });
    }

    res.json({ message: 'Product detail removed', removed: result.rows[0] });

  } catch (error) {
    console.error(error);

    if (error.code === '23503') {
      return res.status(409).json({
        error: 'Cannot delete product detail: it still has inventory recipe lines or orders referencing it',
        detail: error.message
      });
    }

    res.status(500).json({ error: 'Failed to delete product detail', detail: error.message });
  }
});

module.exports = router;
