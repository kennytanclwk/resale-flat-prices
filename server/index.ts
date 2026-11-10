import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { loadRepository } from './data.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be an integer between 1 and 65535.');
try {
  const repository = await loadRepository();
  const server = createApp(repository).listen(port, '0.0.0.0', () => {
    console.log(
      `HDB Lens API listening at http://localhost:${port} (${repository.records.length.toLocaleString()} transactions)`,
    );
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => server.close(() => process.exit(0)));
} catch (error) {
  console.error(
    'Unable to start HDB Lens. Ensure data/hdb-resale.csv and data/metadata.json exist.',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
}
