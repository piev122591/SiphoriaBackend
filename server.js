require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// Railway connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Test route
app.get('/getProducts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products AS a JOIN product_price AS b ON a.id = b.productId');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});

//Run Node Server
//node server.js 