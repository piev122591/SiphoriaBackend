# Discount API Changes (Frontend Update Guide)

Summary of the new `discount` feature: a new `discount` table/endpoint, plus `orders` now supports an optional discount.

---

## New table: `discount`

| column        | type          | notes            |
|---------------|---------------|------------------|
| `id`          | serial (PK)   |                  |
| `name`        | varchar(255)  | required         |
| `description` | text          | optional         |

---

## Changed table: `orders`

Two new nullable columns:

| column        | type          | notes                    |
|---------------|---------------|--------------------------|
| `discount_id` | integer       | optional, FK to `discount.id` |
| `discount`    | numeric(5,2)  | optional, discount percentage (e.g. `10.00` = 10%) |

---

## New endpoints

### `GET /discount`
Returns all discounts.

```json
[
  { "id": 1, "name": "10% Off", "description": "Ten percent off entire order" }
]
```

### `POST /discount`
Creates a new discount.

Request body:
```json
{ "name": "10% Off", "description": "Ten percent off entire order" }
```
- `name` required
- `description` optional

Response: `200` with the created row.

---

## Changed endpoint

### `POST /orders`
Two new optional fields in the request body:

```json
{
  "name": "John Doe",
  "payment_type_id": 1,
  "status_id": 1,
  "remarks": "Extra sugar please",
  "discount_id": 1,
  "discount": 10.00,
  "order_details": [ ... ]
}
```
- `discount_id` — optional, FK to `discount.id`
- `discount` — optional, discount percentage applied to the order (e.g. `10.00` = 10%)

Both are `null` if omitted. The created order returned in the response now includes `discount_id` and `discount`:

```json
{
  "id": 15,
  "name": "John Doe",
  "order_date": "2026-09-02T08:00:00.000Z",
  "payment_type_id": 1,
  "status_id": 1,
  "remarks": "Extra sugar please",
  "discount_id": 1,
  "discount": "10.00",
  "order_details": [ ... ]
}
```

**Known gap:** `GET /orders/:id` and `GET /orders/by-date` do not yet select `discount_id`/`discount` in their query (only `GET /orders` does, via `SELECT *`) — flag this if the frontend needs discount info on those views and it isn't showing up.

---

## Suggested frontend checklist
- [ ] Add a discount picker/dropdown backed by `GET /discount`
- [ ] Add a "manage discounts" form calling `POST /discount` (`name`, `description`)
- [ ] On the "create order" form, send `discount_id` and/or `discount` when a discount is applied
- [ ] Handle orders where `discount_id` / `discount` are `null` (no discount applied)
