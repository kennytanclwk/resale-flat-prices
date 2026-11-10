import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createRepository, parseTransactions } from './data.js';
import { dashboard, median } from './analytics.js';
import type { Filters, SourceMetadata, Transaction } from '../shared/types.js';

const source: SourceMetadata = {
  name: 'Test fixture',
  url: 'https://data.gov.sg',
  datasetId: 'fixture',
  retrievedAt: '2026-11-10T00:00:00Z',
  coverageStart: '2024-01',
  coverageEnd: '2024-04',
  mode: 'snapshot',
};
const base: Transaction = {
  id: '1',
  month: '2024-01',
  town: 'BEDOK',
  flatType: '4 ROOM',
  block: '1',
  streetName: 'BEDOK RD',
  storeyRange: '01 TO 03',
  floorAreaSqm: 100,
  flatModel: 'Model A',
  leaseCommenceDate: 1990,
  remainingLease: '65 years',
  resalePrice: 400_000,
  pricePerSqm: 4_000,
};
const rows: Transaction[] = [
  base,
  { ...base, id: '2', month: '2024-02', resalePrice: 600_000, pricePerSqm: 6_000 },
  { ...base, id: '3', month: '2024-03', resalePrice: 800_000, pricePerSqm: 8_000 },
  { ...base, id: '4', month: '2024-04', resalePrice: 1_000_000, pricePerSqm: 10_000 },
  {
    ...base,
    id: '5',
    month: '2024-04',
    town: 'TAMPINES',
    resalePrice: 1_200_000,
    pricePerSqm: 12_000,
  },
];
const repository = createRepository(rows, source);
const app = createApp(repository, { staticDirectory: 'non-existent-test-assets' });
const filters: Filters = { page: 1, pageSize: 8, sort: 'month', order: 'desc' };

describe('analytics', () => {
  it('computes odd/even medians without mutating inputs and handles empty selections', () => {
    const values = [3, 1, 2, 4];
    expect(median(values)).toBe(2.5);
    expect(values).toEqual([3, 1, 2, 4]);
    expect(median([4, 9, 5])).toBe(5);
    expect(median([])).toBeNull();
  });
  it('compares equal-length prior periods using the same town filter', () => {
    const data = dashboard(repository, {
      ...filters,
      town: 'BEDOK',
      from: '2024-03',
      to: '2024-04',
    });
    expect(data.summary.medianPrice).toBe(900_000);
    expect(data.summary.priceChangePercent).toBe(80);
    expect(data.summary.comparisonLabel).toBe('vs 2024-01 to 2024-02');
    expect(data.summary.millionDollarCount).toBe(1);
  });
  it('does not claim growth against a partial comparison window', () => {
    expect(
      dashboard(repository, { ...filters, from: '2024-02', to: '2024-04' }).summary
        .priceChangePercent,
    ).toBeNull();
  });
  it('withholds comparisons when the selected period includes the snapshot retrieval month', () => {
    const current = createRepository(rows, { ...source, retrievedAt: '2024-04-10T00:00:00Z' });
    const result = dashboard(current, { ...filters, from: '2024-03', to: '2024-04' });
    expect(result.summary.priceChangePercent).toBeNull();
    expect(result.summary.comparisonLabel).toContain('latest month incomplete');
  });
  it('uses Singapore calendar months when determining completeness at a UTC month boundary', () => {
    const current = createRepository(rows, { ...source, retrievedAt: '2024-03-31T16:00:00Z' });
    expect(
      dashboard(current, { ...filters, from: '2024-03', to: '2024-03' }).summary.priceChangePercent,
    ).not.toBeNull();
    expect(
      dashboard(current, { ...filters, from: '2024-04', to: '2024-04' }).summary.priceChangePercent,
    ).toBeNull();
  });
  it('uses median of individual price-per-square-metre values', () => {
    const custom = createRepository(
      [
        { ...base, id: '1', floorAreaSqm: 50, resalePrice: 400_000, pricePerSqm: 8_000 },
        { ...base, id: '2', floorAreaSqm: 200, resalePrice: 600_000, pricePerSqm: 3_000 },
        { ...base, id: '3', floorAreaSqm: 100, resalePrice: 700_000, pricePerSqm: 7_000 },
      ],
      source,
    );
    expect(dashboard(custom, filters).summary.medianPsm).toBe(7_000);
  });
});

describe('HTTP API', () => {
  it('reports actual coverage, snapshot provenance, and security headers', async () => {
    const res = await request(app).get('/api/meta').expect(200);
    expect(res.body.totalRecords).toBe(5);
    expect(res.body.minMonth).toBe('2024-01');
    expect(res.body.source.mode).toBe('snapshot');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    await request(app).get('/api/health').expect(200);
  });
  it('filters and paginates consistently, including out-of-range pages', async () => {
    const res = await request(app)
      .get('/api/dashboard')
      .query({ town: 'BEDOK', minPrice: 600000, pageSize: 2, sort: 'price', order: 'asc', page: 2 })
      .expect(200);
    expect(res.body.summary.count).toBe(3);
    expect(res.body.transactions.map((r: Transaction) => r.resalePrice)).toEqual([1_000_000]);
    expect(res.body.pagination.totalPages).toBe(2);
    const high = await request(app).get('/api/dashboard?page=999&pageSize=2').expect(200);
    expect(high.body.pagination.page).toBe(3);
  });
  it.each([
    'from=2024-13',
    'from=2024-04&to=2024-01',
    'minPrice=900&maxPrice=10',
    'page=0',
    'pageSize=1000',
    'sort=sql',
    'town=INVALID',
    'page=1&page=2',
    'unknown=bad',
    'minPrice=NaN',
  ])('rejects invalid query %s', async (query) => {
    await request(app).get(`/api/dashboard?${query}`).expect(400);
  });
  it('returns null medians and an empty list for an empty result', async () => {
    const res = await request(app).get('/api/dashboard?search=nonexistent').expect(200);
    expect(res.body.summary.medianPrice).toBeNull();
    expect(res.body.transactions).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });
  it('exports every matching row beyond the current page and protects spreadsheet formula cells', async () => {
    const malicious = createApp(
      createRepository(
        [
          { ...base, streetName: '=DANGER()' },
          { ...base, id: '2', streetName: '  +DANGER()' },
        ],
        source,
      ),
    );
    const res = await request(malicious).get('/api/export?pageSize=1').expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.split('\r\n')).toHaveLength(3);
    expect(res.text).toContain('"\'=DANGER()"');
    expect(res.text).toContain('"\'  +DANGER()"');
    expect(res.headers['content-disposition']).toContain('attachment');
  });
  it('returns JSON 404s for unknown API endpoints', async () => {
    const res = await request(app).get('/api/missing').expect(404);
    expect(res.body.error).toBeDefined();
  });
});

describe('CSV ingestion', () => {
  const header =
    'month,town,flat_type,block,street_name,storey_range,floor_area_sqm,flat_model,lease_commence_date,remaining_lease,resale_price\n';
  it('preserves real rows including quoted text and fractional prices', () => {
    const result = parseTransactions(
      header + '2024-01,BEDOK,4 ROOM,1,"BEDOK, ROAD",01 TO 03,100,Model A,1990,65 years,500000.50',
    );
    expect(result[0].streetName).toBe('BEDOK, ROAD');
    expect(result[0].pricePerSqm).toBe(5000.005);
  });
  it('rejects invalid transactions rather than silently biasing summaries', () => {
    expect(() =>
      parseTransactions(
        header + '2024-01,BEDOK,4 ROOM,1,RD,01 TO 03,0,Model A,1990,65 years,500000',
      ),
    ).toThrow('Invalid dataset row');
    expect(() => parseTransactions(header)).toThrow('no transactions');
  });
});
