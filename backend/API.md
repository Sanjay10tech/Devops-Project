# Backend API Documentation

Base URL (local): `http://localhost:4000`
API version prefix: `/api/v1`

All responses are JSON. Successful payloads are wrapped in a `data` field.
Errors use a consistent envelope:

```json
{ "error": { "code": "NOT_FOUND", "message": "…", "details": {} } }
```

---

## Health & Readiness

### `GET /health` — liveness
Returns 200 while the process is running. Does not touch the database.

```json
{
  "status": "ok",
  "service": "netflix-backend",
  "timestamp": "2026-09-15T10:00:00.000Z",
  "uptime": 12.34
}
```

### `GET /ready` — readiness
Checks database connectivity. Returns 200 when ready, 503 when not.

Ready:
```json
{ "status": "ready", "checks": { "database": "ok" } }
```
Not ready (HTTP 503):
```json
{ "status": "not_ready", "checks": { "database": "error" } }
```

---

## Content

### `GET /api/v1/content/home`
Returns the featured hero item plus category rows for the landing page.

```json
{
  "data": {
    "featured": { "id": "…", "title": "Neon Horizon", "...": "..." },
    "categories": [
      { "slug": "trending", "name": "Trending Now", "items": [ /* Content[] */ ] }
    ]
  }
}
```

### `GET /api/v1/content`
List/filter content.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `category` | string | – | filter by category slug |
| `type` | `movie` \| `show` | – | filter by type |
| `limit` | int (1–100) | 20 | page size |
| `offset` | int (≥0) | 0 | page offset |

```json
{
  "data": [ /* Content[] */ ],
  "pagination": { "total": 10, "limit": 20, "offset": 0 }
}
```

### `GET /api/v1/content/search?q=...`
Full-text-ish search over title and description (case-insensitive).

| Query param | Type | Default | Notes |
|---|---|---|---|
| `q` | string (1–128) | – | **required** |
| `limit` | int (1–100) | 20 | page size |
| `offset` | int (≥0) | 0 | page offset |

```json
{
  "data": [ /* Content[] */ ],
  "query": "neon",
  "pagination": { "total": 1, "limit": 20, "offset": 0 }
}
```

Missing `q` returns HTTP 400:
```json
{ "error": { "code": "BAD_REQUEST", "message": "Validation failed", "details": { "q": ["Search query 'q' is required"] } } }
```

### `GET /api/v1/content/:id`
Fetch a single content item by UUID.

- 200 with `{ "data": Content }` when found
- 400 if `id` is not a valid UUID
- 404 if not found

---

## Content object shape

```ts
interface Content {
  id: string;               // uuid
  title: string;
  type: "movie" | "show";
  description: string;
  releaseYear: number;
  maturityRating: string;   // e.g. "PG-13", "TV-MA"
  durationMinutes: number | null; // movies
  seasons: number | null;         // shows
  genres: string[];
  categorySlug: string;
  categoryName: string;
  thumbnailUrl: string;
  backdropUrl: string;
  trailerUrl: string | null;
  rating: number;           // 0–10
  featured: boolean;
}
```

---

## Error codes

| HTTP | code | Meaning |
|---|---|---|
| 400 | `BAD_REQUEST` | validation failed |
| 404 | `NOT_FOUND` | resource/route not found |
| 500 | `INTERNAL_ERROR` | unexpected server error |
| 503 | (readiness) | dependency not ready |
