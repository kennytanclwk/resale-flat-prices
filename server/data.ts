import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import type { Metadata, SourceMetadata, Transaction } from '../shared/types.js';
import { indexMonth, monthIndex, singaporeMonth } from '../shared/months.js';

export const DATASET_ID = 'd_8b84c4ee58e3cfc0ece0d773c8ca6abc';
export const SOURCE_URL = `https://data.gov.sg/datasets/${DATASET_ID}/view`;
const month = /^\d{4}-(0[1-9]|1[0-2])$/;
const rowSchema = z.object({
  month: z.string().regex(month),
  town: z.string().min(1),
  flat_type: z.string().min(1),
  block: z.string().min(1),
  street_name: z.string().min(1),
  storey_range: z.string().min(1),
  floor_area_sqm: z.coerce.number().positive().finite(),
  flat_model: z.string().min(1),
  lease_commence_date: z.coerce.number().int().min(1900).max(2200),
  remaining_lease: z.string().min(1),
  resale_price: z.coerce.number().positive().finite(),
});

export function parseTransactions(csv: string): Transaction[] {
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  }) as unknown[];
  if (rows.length === 0) throw new Error('Dataset contains no transactions.');
  return rows.map((raw, index) => {
    const result = rowSchema.safeParse(raw);
    if (!result.success)
      throw new Error(`Invalid dataset row ${index + 2}: ${result.error.message}`);
    const row = result.data;
    return {
      id: String(index + 1),
      month: row.month,
      town: row.town,
      flatType: row.flat_type,
      block: row.block,
      streetName: row.street_name,
      storeyRange: row.storey_range,
      floorAreaSqm: row.floor_area_sqm,
      flatModel: row.flat_model,
      leaseCommenceDate: row.lease_commence_date,
      remainingLease: row.remaining_lease,
      resalePrice: row.resale_price,
      pricePerSqm: row.resale_price / row.floor_area_sqm,
    };
  });
}

export interface Repository {
  records: readonly Transaction[];
  meta: Metadata;
}

export function createRepository(
  records: readonly Transaction[],
  source: SourceMetadata,
): Repository {
  if (records.length === 0) throw new Error('Cannot initialize an empty dataset.');
  const months = records.map((row) => row.month).sort();
  const minMonth = months[0];
  const maxMonth = months[months.length - 1];
  const lastClosedMonth = indexMonth(monthIndex(singaporeMonth(source.retrievedAt)) - 1);
  const lastCoveredMonth = maxMonth < lastClosedMonth ? maxMonth : lastClosedMonth;
  return {
    records,
    meta: {
      towns: [...new Set(records.map((row) => row.town))].sort(),
      flatTypes: [...new Set(records.map((row) => row.flatType))].sort(),
      minMonth,
      maxMonth,
      latestCompleteMonth: lastCoveredMonth >= minMonth ? lastCoveredMonth : null,
      totalRecords: records.length,
      source: { ...source, coverageStart: minMonth, coverageEnd: maxMonth, mode: 'snapshot' },
    },
  };
}

export async function loadRepository(
  directory = process.env.DATA_DIR || path.resolve('data'),
): Promise<Repository> {
  const [csv, metadata] = await Promise.all([
    readFile(path.join(directory, 'hdb-resale.csv'), 'utf8'),
    readFile(path.join(directory, 'metadata.json'), 'utf8'),
  ]);
  const source = JSON.parse(metadata) as SourceMetadata & { sha256?: string; recordCount?: number };
  if (!source.retrievedAt || !Number.isFinite(Date.parse(source.retrievedAt)))
    throw new Error('Invalid snapshot retrieval timestamp.');
  if (source.sha256 && createHash('sha256').update(csv).digest('hex') !== source.sha256)
    throw new Error('Snapshot checksum does not match metadata. Run data:refresh again.');
  const records = parseTransactions(csv);
  if (source.recordCount !== undefined && source.recordCount !== records.length)
    throw new Error('Snapshot row count does not match metadata.');
  return createRepository(records, source);
}
