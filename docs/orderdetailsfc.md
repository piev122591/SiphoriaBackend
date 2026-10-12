# Order Details `fc` Column (Frontend Update Guide)

Summary of what changed in `routes/orders.js` to snapshot food cost onto `order_details`.

## Core change

`order_details` now has an `fc` column (food cost, numeric), alongside `price`. It's captured **at order-creation time** — same pattern as `price` — so historical orders keep the food cost as it was, even if `product_details.fc` changes later.

**Frontend impact:** when building the order payload, send `fc` per line item (read from the product's current `product_details.fc`), the same way `price` is already sent per line item today.

---

## Changed endpoints

### `POST /orders`
- Each object in `order_details` now accepts an optional `fc`.
- Not required — if omitted, stored as `null`.

Request body:
```json
{
  "name": "John Doe",
  "payment_type_id": 1,
  "status_id": 1,
  "remarks": "Extra sugar please",
  "order_details": [
    {
      "product_details_id": 1,
      "qty": 2,
      "price": 150.00,
      "fc": 35.50
    }
  ]
}
```

### `GET /orders/:id`
### `GET /orders/by-date`
- Each entry in the `order_details` JSON array now includes `fc`.

Example `order_details` entry:
```json
{
  "id": 12,
  "product_details_id": 1,
  "qty": 2,
  "price": 150.00,
  "fc": 35.50
}
```

### `GET /orders/order-details/:id`
- Each row now includes `fc`.

Example row:
```json
{
  "id": 12,
  "orderid": 5,
  "product_details_id": 1,
  "qty": 2,
  "price": 150.00,
  "fc": 35.50,
  "sizeid": 3,
  "size_name": "...",
  "product_name": "..."
}
```

---

## Unchanged endpoints
- `GET /orders`
- `PATCH /orders/:id/status`

---

## Suggested frontend checklist
- [ ] When placing an order, include `fc` per line item (pull the value from the selected `product_details.fc` at the time the item is added to the cart)
- [ ] Display `fc` / computed margin (`price - fc`) on order detail and order history views if needed for reporting
- [ ] Do not expect `fc` to update on historical orders if `product_details.fc` changes later — it's a snapshot, by design (see [productdetailfc.md](productdetailfc.md))
- [ ] Treat `fc` as optional — older orders placed before this change will have `fc: null` on their line items
