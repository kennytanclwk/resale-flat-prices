# HTTP API

Development base URL: `http://localhost:3001`. Production serves the frontend and API from the same origin. All endpoints are read-only and require no authentication. Metadata and analysis come from the validated local snapshot; requests do not call data.gov.sg.

## Endpoints

| Method and path | Description |
| --- | --- |
| `GET /api/health` | Process readiness, including loaded snapshot status. Used by container and load-balancer health checks. |
| `GET /api/meta` | Available towns/flat types, record count, date coverage, dataset ID, source URL, and retrieval timestamp. |
| `GET /api/dashboard` | Filtered summary, monthly medians, town comparisons, flat-type mix, insights, and one page of transactions. |
| `GET /api/export` | CSV of the filtered transactions, including all pages. Uses the same filters and sorting as the dashboard. |

## Dashboard and export query parameters

| Parameter | Example | Meaning |
| --- | --- | --- |
| `town` | `ANG MO KIO` | Exact source town; omit to include all. |
| `flatType` | `4 ROOM` | Exact source flat type; omit to include all. |
| `from` | `2025-01` | Inclusive start registration month. |
| `to` | `2025-12` | Inclusive end registration month. |
| `minPrice` | `400000` | Inclusive minimum resale price in SGD. |
| `maxPrice` | `800000` | Inclusive maximum resale price in SGD. |
| `search` | `ANG MO KIO AVE` | Case-insensitive substring in block, street address, or town. |
| `sort` | `month` | `month`, `price`, or `area`. |
| `order` | `desc` | `asc` or `desc`. |
| `page` | `1` | One-based dashboard page. |
| `pageSize` | `8` | Number of dashboard records per page; bounded by the server. |

Dates must be real `YYYY-MM` values. Inverted date/price ranges, unsupported enum values, malformed numbers, arrays, and invalid pagination are rejected rather than interpreted as a different query. Use `/api/meta` to obtain supported town/flat-type values and coverage.

```sh
curl 'http://localhost:3001/api/dashboard?town=ANG%20MO%20KIO&flatType=4%20ROOM&from=2025-01&to=2025-12&page=1&pageSize=8&sort=price&order=desc'
curl 'http://localhost:3001/api/export?town=ANG%20MO%20KIO&from=2025-01&to=2025-12' -o transactions.csv
```

## Response structure

The dashboard returns these fields (the shared TypeScript contract is in `shared/types.ts`):

```text
summary        count, medianPrice, medianPsm, medianArea, millionDollarCount,
               priceChangePercent, comparisonLabel
trend          month, count, medianPrice, medianPsm for each matching month
towns          town, count, medianPrice, medianPsm
flatTypes      flatType, count, medianPrice
transactions   full normalized records for the requested page
pagination     page, pageSize, total, totalPages
insights       descriptions derived from the filtered data
```

Prices and areas are JSON numbers; display rounding happens in the frontend. `priceChangePercent` is `null` when a fair comparison cannot be calculated. An empty query result is a successful response with zero count and empty arrays. The frontend renders unavailable medians as an em dash.

CSV exports use standard quoting and protect spreadsheet consumers against formula interpretation. HTTP errors carry a controlled JSON message; callers should inspect the HTTP status before consuming the result. Unknown API routes are errors, rather than the SPA HTML fallback.
