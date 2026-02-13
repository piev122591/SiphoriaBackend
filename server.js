require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   🔥 DEBUG Railway ENV
================================ */
console.log("DATABASE_URL exists:", !!process.env.DATABASE_URL);

/* ===============================
   🐘 PostgreSQL Connection
================================ */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL successfully"))
  .catch(err => console.error("❌ Initial DB Connection Error:", err));

/* 🔥 Make pool accessible in routes */
app.locals.pool = pool;

/* ===============================
   📦 ROUTES
================================ */
const productsRoutes = require('./routes/products');
app.use('/products', productsRoutes);

const categoryRoutes = require('./routes/category');
app.use('/category', categoryRoutes);

/* ===============================
   📘 Swagger Setup
================================ */
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Siphoria",
      version: "1.0.0",
    },
    servers: [
      {
        url: "/",   // ✅ use current host automatically
      },
    ],
  },
  apis: ["./routes/*.js"],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/* ===============================
   🧪 DB TEST ROUTE
================================ */
app.get('/test', async (req, res) => {
  try {
    const result = await pool.query('SELECT 1');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   🚀 START SERVER
================================ */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
