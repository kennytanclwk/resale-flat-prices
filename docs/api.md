# HTTP API

Development base URL: `http://localhost:3001`. Production serves the frontend and API from the same origin. All endpoints are read-only and require no authentication. Metadata and analysis come from the validated local snapshot; requests do not call data.gov.sg.

## Endpoints

| Method and path | Description |
| --- | --- |
| `GET /api/health` | Process readiness, including loaded snapshot status. Used by container and load-balancer health checks. |
| `GET /api/meta` | Available towns/flat types, record count, date coverage, `latestCompleteMonth`, dataset ID, source URL, and retrieval timestamp. |
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
               priceChangePercent, comparisonLabel, comparisonUnavailableReason,
               priceDistribution: { min, lowerQuartile, median, upperQuartile, max } | null
trend          month, count, medianPrice, medianPsm for each matching month
towns          town, count, medianPrice, medianPsm
flatTypes      flatType, count, medianPrice
transactions   full normalized records for the requested page
pagination     page, pageSize, total, totalPages
insights       descriptions derived from the filtered data
```

Prices and areas are JSON numbers; display rounding happens in the frontend. `priceChangePercent` is `null` when a fair comparison cannot be calculated. An empty query result is a successful response with zero count and empty arrays. The frontend renders unavailable medians as an em dash.

`priceDistribution` uses every matching transaction, independently of `page` and `pageSize`. Its quartiles use linear interpolation at `(n - 1) × p` (R-7); an empty selection returns `null`. A single transaction or constant-price selection returns the same value for all five statistics.

`comparisonUnavailableReason` is `null` when the comparison is available. Otherwise it is one of:

| Value | Meaning |
| --- | --- |
| `no_transactions` | The selected filters have no matching transactions. |
| `incomplete_month` | The selection includes the snapshot retrieval month in Singapore, or a later month. |
| `insufficient_coverage` | The complete selected/prior windows are not within the snapshot's coverage. |
| `no_prior_transactions` | The preceding covered window has no transactions matching the same non-date filters. |

`latestCompleteMonth` is the latest closed Singapore calendar month within observed coverage, or `null` if no closed month is covered. It is calculated from the snapshot retrieval timestamp, not server wall-clock time, so refreshing the snapshot is the only way to move that boundary. It does not guarantee that the publisher will never revise historical records.

CSV exports use standard quoting and protect spreadsheet consumers against formula interpretation. HTTP errors carry a controlled JSON message; callers should inspect the HTTP status before consuming the result. Unknown API routes are errors, rather than the SPA HTML fallback.
