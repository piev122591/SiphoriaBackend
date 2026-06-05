const express = require('express');
const router = express.Router();

/**
 * @swagger
 * /products:
 *   get:
 *     tags:
 *       - Products
 *     summary: Get all products
 *     responses:
 *       200:
 *         description: List of products
 */
    router.get('/', async (req, res) => {
      try {
        const pool = req.app.locals.pool;

        const result = await pool.query(`SELECT 
              p.id,
              p.name,
              p.categoryid,
              MAX(pd.image_url) AS image_url,
              MAX(pd.price) AS price,
              a.name AS "categoryName",
              STRING_AGG(s.name, ', ') AS sizes
              FROM products p 
              JOIN product_details pd ON pd.productid = p.id 
              JOIN category a ON p.categoryid = a.id
              JOIN size s ON pd.sizeid = s.id 
              GROUP BY p.id, p.name, p.categoryid, a.name`
            );

        res.json(result.rows);

      } catch (error) {
        console.error("Products API error:", error);
        res.status(500).json({ error: 'Failed to fetch products' });
      }
    });

  

/**
 * @swagger
 * /products:
 *   post:
 *     tags:
 *       - Products
 *     summary: Create a new product
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - categoryid
 *             properties:
 *               name:
 *                 type: string
 *                 example: MATCHA LATTE
 *               categoryid:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       201:
 *         description: Product created successfully
 *       400:
 *         description: name and categoryid are required
 *       500:
 *         description: Failed to create product
 */
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { name, categoryid } = req.body;

    if (!name || categoryid === undefined || categoryid === null) {
      return res.status(400).json({ error: 'name and categoryid are required' });
    }

    const result = await pool.query(
      'INSERT INTO products (name, categoryid) VALUES ($1, $2) RETURNING *',
      [name, categoryid]
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});


/**
 * @swagger
 * /product-price:
 *   get:
 *     tags:
 *       - Products
 *     summary: Get all Product Price
 *     responses:
 *       200:
 *         description: List of product Price
 */
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query('SELECT * FROM product_price');
    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch product price' });
  }
});

/**
 * @swagger
 * /product-price:
 *   post:
 *     tags:
 *       - Products
 *     summary: Create new product price
 */
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { name, price } = req.body;

    const result = await pool.query(
      'INSERT INTO size (name, price) VALUES ($1, $2) RETURNING *',
      [name, price]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create product size' });
  }
});



/**
 * @swagger
 * /product-size:
 *   get:
 *     tags:
 *       - Products
 *     summary: Get all Size
 *     responses:
 *       200:
 *         description: List of size
 */
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query('SELECT * FROM size');
    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch product size' });
  }
});

/**
 * @swagger
 * /product-size:
 *   post:
 *     tags:
 *       - Products
 *     summary: Create new size
 */
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { name, price } = req.body;

    const result = await pool.query(
      'INSERT INTO size (name, price) VALUES ($1, $2) RETURNING *',
      [name, price]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create size' });
  }
});



module.exports = router;
