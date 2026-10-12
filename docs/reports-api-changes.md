# Reports API (Frontend Update Guide)

New `routes/reports.js`, mounted at `/reports` in `server.js`. This is a brand-new endpoint (not part of `routes/orders.js`) — reports are a derived/aggregated view over orders + order_details, not a CRUD operation on orders, so it gets its own file like `products`, `category`, `inventory`, etc.

---

## New endpoint

### `GET /reports/daily-sales`
Returns one row per day (within the requested range) with total serving count, gross sales, food cost, VAT, and gross profit — matches the figures used in the manual "SIPHORIA PAOMBONG" daily sales sheet.

Query params:
- `start_date` required, e.g. `2026-08-01`
- `end_date` required, e.g. `2026-08-05`

Request:
```
GET /reports/daily-sales?start_date=2026-08-01&end_date=2026-08-05
```

Response — `200`:
```json
[
  {
    "report_date": "2026-08-01",
    "total_serving": "132",
    "gross_sales": "22510.00",
    "food_cost": "7915.10",
    "vat": "2701.20",
    "gross_profit": "11893.70"
  }
]
```

Calculation per day (`od` = order_details, `o` = orders, joined on `order_date`):
- `total_serving` = SUM(qty)
- `gross_sales` = SUM(price × qty)
- `food_cost` = SUM(fc × qty)
- `vat` = gross_sales × 12%
- `gross_profit` = gross_sales − food_cost − vat

Status codes:
- `200` — success, returns array of daily rows (empty array if no orders in range)
- `400` — `start_date` or `end_date` missing
- `500` — server/DB error

## Suggested frontend checklist
- [ ] Add a "Reports" view that calls `GET /reports/daily-sales` with a date range picker
- [ ] Render columns matching the manual sheet: Date, Total Serving, Gross Sales, Food Cost, 12% VAT, Gross Profit
- [ ] Values come back as numeric strings (Postgres `SUM`/`NUMERIC`) — parse to number before formatting/rounding in the UI
