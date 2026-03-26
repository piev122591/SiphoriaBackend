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




module.exports = router;
