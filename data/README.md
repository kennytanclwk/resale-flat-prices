# HDB source snapshot

`hdb-resale.csv` contains the unmodified official data.gov.sg CSV for dataset `d_8b84c4ee58e3cfc0ece0d773c8ca6abc`, published by the Housing & Development Board. It was retrieved on **10 November 2026** and contains **244,312 records**, covering **January 2017–November 2026**. November 2026 is incomplete at retrieval time.

Source: [Resale flat prices based on registration date from Jan-2017 onwards](https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view). Reused under the [Singapore Open Data Licence](https://data.gov.sg/open-data-licence).

`metadata.json` records the exact retrieval timestamp, observed coverage, record count, and SHA-256 of the raw CSV. Startup validates rows, checksum, and record count. `.gitattributes` preserves CSV bytes across platforms so Git newline conversion does not invalidate the checksum. Transactions with the same values are preserved: the source has no stable transaction identifier, and identical rows need not represent an accidental duplicate. Application row IDs are positions within a snapshot and may change after refresh.

Run `pnpm data:refresh` from the repository root to retrieve and validate a new snapshot. Restart the backend after refreshing. Commit the CSV and matching metadata together. Update the summary in this file when reviewing a new snapshot.
