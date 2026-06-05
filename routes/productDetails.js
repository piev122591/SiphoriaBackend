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

module.exports = router;
