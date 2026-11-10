import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATASET_ID, SOURCE_URL, parseTransactions } from '../server/data.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const base = `https://api-open.data.gov.sg/v1/public/api/datasets/${DATASET_ID}`;
const directory = path.resolve(process.env.DATA_DIR || 'data');
const headers: Record<string, string> = { Accept: 'application/json' };
if (process.env.DATA_GOV_SG_API_KEY) headers['x-api-key'] = process.env.DATA_GOV_SG_API_KEY;

interface DownloadResponse {
  code: number;
  data?: { status?: string; url?: string };
  errorMsg?: string;
}

async function request(url: string, json = true): Promise<Response> {
  const response = await fetch(url, {
    headers: json ? headers : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new Error(
      `Upstream returned HTTP ${response.status}${response.status === 429 ? '; quota exceeded, retry after a minute or supply DATA_GOV_SG_API_KEY' : ''}.`,
    );
  return response;
}

async function downloadUrl(): Promise<string> {
  let result = (await (await request(`${base}/initiate-download`)).json()) as DownloadResponse;
  if (result.code !== 0)
    throw new Error(`Download could not start: ${result.errorMsg || 'unknown upstream error'}`);
  for (let attempt = 0; attempt < 4; attempt++) {
    if (result.data?.url) return result.data.url;
    // Unauthenticated API quota is five requests/minute. Keep below it.
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    result = (await (await request(`${base}/poll-download`)).json()) as DownloadResponse;
    if (result.code !== 0)
      throw new Error(`Download failed: ${result.errorMsg || 'unknown upstream error'}`);
  }
  throw new Error('Dataset download is still processing. Retry the refresh later.');
}

async function refresh() {
  console.log('Requesting official HDB resale snapshot from data.gov.sg…');
  const url = await downloadUrl();
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:') throw new Error('Download URL must use HTTPS.');
  const response = await request(url, false);
  const maxBytes = 100 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > maxBytes)
    throw new Error('Dataset exceeds 100 MB download limit.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (!response.body) throw new Error('Dataset download returned an empty body.');
  const reader = response.body.getReader();
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    size += chunk.byteLength;
    if (size > maxBytes) throw new Error('Dataset exceeds 100 MB download limit.');
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  const records = parseTransactions(buffer.toString('utf8'));
  const months = records.map((row) => row.month).sort();
  const metadata = {
    name: 'HDB resale flat prices · January 2017 onwards',
    url: SOURCE_URL,
    datasetId: DATASET_ID,
    retrievedAt: new Date().toISOString(),
    coverageStart: months[0],
    coverageEnd: months[months.length - 1],
    mode: 'snapshot',
    recordCount: records.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
  await mkdir(directory, { recursive: true });
  const suffix = `.pending-${process.pid}`;
  const csvPath = path.join(directory, 'hdb-resale.csv');
  const metadataPath = path.join(directory, 'metadata.json');
  const oldCsv = await readFile(csvPath).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  const oldMetadata = await readFile(metadataPath).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  try {
    await writeFile(csvPath + suffix, buffer);
    await writeFile(metadataPath + suffix, JSON.stringify(metadata, null, 2) + '\n');
    await rename(csvPath + suffix, csvPath);
    await rename(metadataPath + suffix, metadataPath);
  } catch (error) {
    if (oldCsv) await writeFile(csvPath, oldCsv);
    if (oldMetadata) await writeFile(metadataPath, oldMetadata);
    throw error;
  } finally {
    await rm(csvPath + suffix, { force: true });
    await rm(metadataPath + suffix, { force: true });
  }
  console.log(
    `Saved ${records.length.toLocaleString()} genuine HDB transactions (${metadata.coverageStart} to ${metadata.coverageEnd}). Restart the API to load the refreshed snapshot.`,
  );
}

refresh().catch((error) => {
  console.error(
    'Refresh failed; existing snapshot retained:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
