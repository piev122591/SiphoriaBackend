require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// 🔥 DEBUG: Check if Railway sees DATABASE_URL
console.log("DATABASE_URL exists:", !!process.env.DATABASE_URL);
console.log("DATABASE_URL value:", process.env.DATABASE_URL);

// Railway PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Optional: Test connection on startup
pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL successfully"))
  .catch(err => console.error("❌ Initial DB Connection Error:", err));

// Test route
app.get('/getProducts', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products AS a JOIN product_price AS b ON a.id = b.productId'
    );
    res.json(result.rows);
  } catch (err) {
    console.error("🔥 QUERY ERROR:", err);
    res.status(500).json({ 
      error: err.message,
      detail: err.detail || null,
      code: err.code || null
    });
  }
});

// Simple DB test route
app.get('/test', async (req, res) => {
  try {
    const result = await pool.query('SELECT 1');
    res.json(result.rows);
  } catch (err) {
    console.error("🔥 TEST ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ IMPORTANT FOR RAILWAY
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
