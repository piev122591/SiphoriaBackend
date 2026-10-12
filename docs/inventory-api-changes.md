# Inventory API Changes (Frontend Update Guide)

Summary of what changed in `routes/inventory.js` and what the frontend needs to update to match.

## Core change: stock is now ledger-based

Previously, `inventory.quantity` was a single column you set directly (via `PATCH /inventory/:id/quantity`).

Now, stock-in events are recorded as rows in an `inventory_details` table (`inventory_id`, `quantity`, `note`, `created_at`). The `quantity` shown for an item is the **sum of all its `inventory_details` rows**, and `quantity_remaining` is that sum minus consumption from completed orders.

**Frontend impact:** any "set stock to X" UI must become "add a stock-in entry of X" — quantity is additive history now, not an editable field.

---

## Removed endpoint

### `PATCH /inventory/:id/quantity` — **gone**

Replace any call to this with `POST /inventory/:id/details` (see below).

---

## New endpoints

### `GET /inventory/:id/details`
Returns stock-in history for one item.

```json
[
  { "id": 3, "inventory_id": 1, "quantity": 50, "note": "Weekly delivery", "created_at": "2026-07-20T08:00:00.000Z" },
  { "id": 1, "inventory_id": 1, "quantity": 100, "note": "Initial stock", "created_at": "2026-07-01T09:00:00.000Z" }
]
```
Use this to show a restock/history log on the item detail view.

### `POST /inventory/:id/details`
Records a new stock-in (restock) event. **Additive**, not a replacement value.

Request body:
```json
{ "quantity": 50, "note": "Weekly delivery" }
```
- `quantity` required
- `note` optional
- 404 if the inventory item doesn't exist

Response: `201` with the created row.

Use this wherever the old "restock" / "adjust quantity" form lived.

### `PATCH /inventory/:id/details/:detail_id`
Corrects a stock-in record's **quantity** and/or **note** (e.g. wrong count typed in). Either field is optional but at least one is required. Does **not** move the record to a different inventory item — `id` in the URL must match the record's actual `inventory_id`.

Path params:
- `id` — inventory item ID (e.g. `1`)
- `detail_id` — the stock-in record's own ID (e.g. `3`)

Request body (either field, both optional, but at least one required):
```json
{ "quantity": 40, "note": "Corrected count" }
```

Success response — `200`:
```json
{ "id": 3, "inventory_id": 1, "quantity": 40, "note": "Corrected count", "created_at": "2026-07-20T08:00:00.000Z" }
```

Status codes:
- `200` — updated successfully, returns the updated record
- `400` — neither `quantity` nor `note` was provided
- `404` — no stock-in record with that `detail_id` under that `id`
- `500` — server/DB error

### `DELETE /inventory/:id/details/:detail_id`
Removes a stock-in record entirely — use this when an entry was logged against the **wrong item** or shouldn't exist at all (as opposed to `PATCH`, which just fixes the number).

Path params:
- `id` — inventory item ID (e.g. `1`)
- `detail_id` — the stock-in record's own ID (e.g. `3`)

Success response — `200`:
```json
{
  "message": "Stock-in record removed",
  "removed": { "id": 3, "inventory_id": 1, "quantity": 40, "note": "Corrected count", "created_at": "2026-07-20T08:00:00.000Z" }
}
```

Status codes:
- `200` — removed successfully, returns the deleted record under `removed`
- `404` — no stock-in record with that `detail_id` under that `id`
- `500` — server/DB error

**Note:** deleting or editing a stock-in record changes the item's computed `quantity` / `quantity_remaining` on the next `GET /inventory` call, since those are derived by summing `inventory_details` — no separate recalculation step needed on the frontend.

---

## Changed endpoints

### `GET /inventory`
- `quantity` is now the sum of `inventory_details` for that item (was: raw `inventory.quantity` column).
- Response shape is otherwise unchanged (`id`, `name`, `unit`, `quantity`, `consumed`, `quantity_remaining`, `reorder_level`, `updated_at`).

### `POST /inventory`
- `quantity` in the request body is now **optional opening stock**, not the item's stored quantity column.
- If provided and non-zero, it's inserted as an `inventory_details` row with `note: "Initial stock"`.
- If omitted, the item is created with no stock rows (quantity shows as 0).
- Runs in a DB transaction — item + optional opening stock succeed or fail together.
- Response is still just the created `inventory` row (no `quantity` field in the raw response — fetch via `GET /inventory` or `GET /inventory/:id/details` to see stock).

### `PUT /inventory/:id`
- No functional change to inputs/outputs (`name`, `unit`, `reorder_level`). Still does **not** touch quantity — use the `/details` endpoints for stock.

### `GET /inventory/product-details/:product_details_id`
- `inventory_quantity` and `inventory_quantity_remaining` are now computed from summed `inventory_details` instead of the old `inventory.quantity` column.
- Field names in the response are unchanged.

---

## Unchanged endpoints
- `GET /inventory` (shape only, see above)
- `POST /inventory/product-details/:product_details_id` (add recipe line)
- `PATCH /inventory/product-details/:product_details_id/:inventory_id` (update recipe line quantity_used)
- `DELETE /inventory/product-details/:product_details_id/:inventory_id` (remove recipe line)

---

## Suggested frontend checklist
- [ ] Remove any call to `PATCH /inventory/:id/quantity`
- [ ] Replace "edit stock quantity" UI with "add stock-in entry" (calls `POST /inventory/:id/details`)
- [ ] Add a stock-in history view/table backed by `GET /inventory/:id/details`
- [ ] Add edit/delete actions per history row using `PATCH` / `DELETE /inventory/:id/details/:detail_id` (for fixing a wrong quantity or removing a mistaken entry)
- [ ] On the "create inventory item" form, keep the optional `quantity` field (now treated as opening stock) and optionally add a `note` for it if you want parity with restocks
- [ ] Confirm nothing on the frontend assumes `quantity` is directly editable via `PUT /inventory/:id`
