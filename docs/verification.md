# Verification record

Verified locally on 10 November 2026 using Node 24.22.1 and pnpm 11.25.0.

| Check | Result |
| --- | --- |
| Vue and backend TypeScript checks | Passed |
| Source formatting | Prettier check passed |
| Vitest suite | 42 tests passed across 4 files |
| Production Vite + backend build | Passed |
| Official snapshot integrity | 244,312 rows parsed; SHA-256 and record count match metadata |
| Production HTTP server | `/`, `/api/health`, and filtered `/api/dashboard` return HTTP 200 |
| Development startup | `pnpm dev` starts Vite and the API; port 5173 serves HDB Lens and proxies metadata for all 244,312 records |
| Browser checks | Desktop and mobile layouts, town/flat filters, per-m² chart, and transaction dialog verified; mobile page has no horizontal overflow |
| Real-data analysis smoke check | Nov 2025–Oct 2026: 25,485 transactions, median S$631,000, 12 monthly groups, 26 towns |
| Terraform | `fmt`, `init -backend=false`, and `validate` passed with Terraform 1.9.8 / AWS provider 6.72.0 |

Frontend tests cover API failure/retry, empty results, URL restoration and malformed values, pagination resets, transaction dialogs/focus, pending-request cancellation, chart keyboard interaction, sparse-month spacing, and ranking selection. Backend tests cover medians, inclusive million-dollar boundaries, equal-length comparisons, incomplete-month handling with Singapore timezone boundaries, filters, pagination, invalid inputs, exports/formula protection, and CSV ingestion.

The package manager's automatic dependency check sees different store paths inside this desktop sandbox. The same package scripts were run with `--config.verify-deps-before-run=false` after installation; this is a local execution-environment workaround, not a requirement for normal cloned-repository usage.

The production process was started using the compiled entrypoint, and initial browser verification used that same process. Development mode was then verified outside the restricted shell, where the `tsx` helper can access the OS account information it needs. The local development preview uses port 5173 and the API uses port 3001.

Docker image execution and AWS deployment were not run: this environment has no Docker executable and the assessment does not require an AWS deployment. Terraform validation checks configuration/schema, rather than account permissions, service quotas, or successful deployment.

## Local analysis improvements — 11 November 2026

The price-distribution and comparison-context changes were checked separately from the original submission:

| Check | Result |
| --- | --- |
| Automated tests | 55 tests passed across 5 files |
| Vue and backend type checks | Passed |
| Production build | Passed |
| Full-cohort distribution | Confirmed independent of table page and page size |
| Real-data complete period | Nov 2025–Oct 2026: 25,485 records; minimum S$233,000, lower quartile S$512,888, median S$631,000, upper quartile S$785,000, maximum S$1,818,000 |
| Comparison availability | Dec 2025–Nov 2026 reports `incomplete_month`; Nov 2025–Oct 2026 reports an available comparison |
| Closed-month metadata | `latestCompleteMonth` is `2026-10` for the current snapshot |

Added tests cover interpolated quartiles, ties, empty and single-price cohorts, filtering before distribution calculation, pagination independence, Singapore month boundaries, specific comparison reasons, and the complete-month shortcut retaining non-date filters. Component tests check accessible descriptions, finite constant-price graphics, empty states, and small-sample notes.

Browser automation was unavailable during this local verification, so the new visual layout was not verified in a live browser. Existing API endpoints were smoke-tested locally. Infrastructure was unchanged and was not revalidated as part of these improvements. These results were recorded before committing and publishing the changes.
