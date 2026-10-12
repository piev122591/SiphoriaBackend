# Ad-hoc Query Endpoint

An API endpoint for running one-off SQL against the database, added because Railway's web query console kept disconnecting. Called from the UI over HTTP.

## Files
- `routes/query.js` — `POST /query` endpoint, mounted in `server.js`

## Usage

`POST /query`

Request body:
```json
{ "sql": "SELECT * FROM orders" }
```

Response:
```json
{ "command": "SELECT", "rowCount": 3, "rows": [ ... ] }
```

Destructive statements (`DELETE`/`UPDATE`/`DROP`/`TRUNCATE`/`ALTER`) are rejected with `400` unless the body also includes `"confirm": true`:
```json
{ "sql": "DELETE FROM order_details WHERE orderid = 12", "confirm": true }
```
Build the UI to show a confirmation step before sending `confirm: true` — this is the only thing standing between a stray `DELETE` and the live database from this endpoint.

**No auth on this endpoint** — same as every other route in this app right now. Anyone who can reach the deployed URL can run arbitrary SQL, by design choice for this project's current stage. Revisit before this app has real users depending on it.
