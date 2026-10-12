# Product Details `fc` Column (Frontend Update Guide)

Summary of what changed in `routes/productDetails.js` and `routes/products.js` to support food costing.

## Core change

`product_details` now has an `fc` column (food cost, numeric) alongside `price`. It's optional — send it when you have a food cost value, omit/null it otherwise.

---

## Changed endpoints

### `GET /products`
- Each row now includes `fc` — the max `fc` across that product's sizes (same aggregation pattern as `price`).

### `GET /productDetails`
- Each row now includes `fc`.

Example row:
```json
{
  "id": 45,
  "productId": 10,
  "name": "...",
  "categoryid": 3,
  "image_url": null,
  "price": 200,
  "fc": 79.50,
  "categoryName": "...",
  "size": "..."
}
```

### `POST /productDetails`
- Accepts optional `fc` in the request body.
- Not required — if omitted, stored as `null`.

Request body:
```json
{
  "productid": 1,
  "sizeid": 2,
  "price": 110,
  "fc": 35.50,
  "image_url": "https://example.com/image.png"
}
```

### `PUT /productDetails/:id`
- Accepts optional `fc` in the request body (same as `POST`).
- **Full replace**: if you omit `fc` on a `PUT`, it will be saved as `null` — send the existing value back if you don't want to clear it.

Request body:
```json
{
  "productid": 1,
  "sizeid": 2,
  "price": 110,
  "fc": 35.50,
  "image_url": "https://example.com/image.png"
}
```

---

## Unchanged endpoints
- `PATCH /productDetails/:id/price` — still price-only, does not touch `fc`.
- `DELETE /productDetails/:id`
- `POST /products`, `DELETE /products/:id`

---

## Suggested frontend checklist
- [ ] Add an `fc` field to the product detail create/edit form
- [ ] Display `fc` on the product/product-details list and detail views
- [ ] On edit (`PUT /productDetails/:id`), make sure the form sends back the current `fc` value if the user isn't changing it (full replace, not a partial patch)
- [ ] If you need to update `fc` alone without resending the whole record, ask backend for a `PATCH /productDetails/:id/fc` endpoint (mirrors the existing price-only patch) — not yet implemented
