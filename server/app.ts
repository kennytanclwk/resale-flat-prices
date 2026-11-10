import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import type { Filters } from '../shared/types.js';
import type { Repository } from './data.js';
import { dashboard, filterTransactions, sortTransactions } from './analytics.js';

const optionalText = (max: number) => z.string().trim().max(max).optional();
const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM.')
  .optional();
const querySchema = z
  .object({
    town: optionalText(40),
    flatType: optionalText(40),
    from: month,
    to: month,
    search: optionalText(100),
    minPrice: z.coerce.number().min(0).max(100_000_000).optional(),
    maxPrice: z.coerce.number().min(0).max(100_000_000).optional(),
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(8),
    sort: z.enum(['month', 'price', 'area']).default('month'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: 'Start month must not follow end month.',
  })
  .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
    message: 'Minimum price must not exceed maximum price.',
  });

export function createApp(repository: Repository, options: { staticDirectory?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          // Local production previews run over HTTP; TLS termination belongs to AWS.
          'upgrade-insecure-requests': null,
        },
      },
    }),
  );
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health', (_req, res) =>
    res.json({
      status: 'ok',
      records: repository.records.length,
      coverageEnd: repository.meta.maxMonth,
    }),
  );
  app.get('/api/meta', (_req, res) => res.json(repository.meta));

  function readFilters(query: unknown): Filters {
    const filters = querySchema.parse(query);
    if (filters.town && !repository.meta.towns.includes(filters.town))
      throw new z.ZodError([{ code: 'custom', path: ['town'], message: 'Unknown town.' }]);
    if (filters.flatType && !repository.meta.flatTypes.includes(filters.flatType))
      throw new z.ZodError([{ code: 'custom', path: ['flatType'], message: 'Unknown flat type.' }]);
    return filters;
  }

  app.get('/api/dashboard', (req, res) => {
    res.json(dashboard(repository, readFilters(req.query)));
  });
  app.get('/api/export', (req, res) => {
    const filters = readFilters(req.query);
    const records = sortTransactions(filterTransactions(repository.records, filters), filters);
    // Every exported value is quoted. Neutralise spreadsheet formula prefixes in textual fields.
    const quote = (value: unknown) => {
      let text = String(value);
      if (/^\s*[=+@\-\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const fields = [
      'month',
      'town',
      'flat_type',
      'block',
      'street_name',
      'storey_range',
      'floor_area_sqm',
      'flat_model',
      'lease_commence_date',
      'remaining_lease',
      'resale_price',
      'price_per_sqm',
    ];
    const lines = records.map((r) =>
      [
        r.month,
        r.town,
        r.flatType,
        r.block,
        r.streetName,
        r.storeyRange,
        r.floorAreaSqm,
        r.flatModel,
        r.leaseCommenceDate,
        r.remainingLease,
        r.resalePrice,
        r.pricePerSqm.toFixed(2),
      ]
        .map(quote)
        .join(','),
    );
    res
      .type('text/csv')
      .attachment('hdb-lens-transactions.csv')
      .send('\uFEFF' + [fields.join(','), ...lines].join('\r\n'));
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  const staticDirectory = options.staticDirectory || path.resolve('dist/client');
  if (existsSync(path.join(staticDirectory, 'index.html'))) {
    app.use(express.static(staticDirectory));
    app.get('/{*path}', (_req, res) => {
      res.sendFile(path.join(staticDirectory, 'index.html'));
    });
  }
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Invalid filters.',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    console.error('Request failed:', error instanceof Error ? error.message : 'unknown error');
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  };
  app.use(errorHandler);
  return app;
}
