import { Router, Request, Response } from 'express';
import { createReadStream } from 'fs';
import { join } from 'path';
import { readFileSync } from 'fs';
import { createGzip } from 'zlib';
import { ch } from '../clickhouse';

const router = Router();
const BATCH_SIZE = 10_000;

// Load the SQL once at startup
const SQL = readFileSync(join(__dirname, '../sql/catalog-management.sql'), 'utf-8');

/**
 * GET /v1/catalog-management
 *
 * Streams all rows as NDJSON. Each line is:
 *   { "batchIndex": 0, "count": 10000, "rows": [...] }
 *
 * Supports:
 *   Accept-Encoding: gzip   → compressed response
 *   ?granularity=day|month  → filter to one granularity (optional)
 */
router.get('/', async (req: Request, res: Response) => {
  const granularity = req.query.granularity as string | undefined;

  // Build optional WHERE clause on top of the SQL
  let sql = SQL;
  if (granularity === 'day') {
    sql = wrapWithGranularityFilter(SQL, 'day');
  } else if (granularity === 'month') {
    sql = wrapWithGranularityFilter(SQL, 'month');
  }

  const acceptGzip = (req.headers['accept-encoding'] ?? '').includes('gzip');

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering

  if (acceptGzip) {
    res.setHeader('Content-Encoding', 'gzip');
  }

  const out = acceptGzip ? createGzip() : res;
  if (acceptGzip) {
    (out as NodeJS.ReadableStream).pipe(res as unknown as NodeJS.WritableStream);
  }

  try {
    const resultSet = await ch.query({ query: sql, format: 'JSONEachRow' });

    const stream = resultSet.stream();
    let batchIndex = 0;
    let batch: unknown[] = [];

    const flush = () => {
      if (batch.length === 0) return;
      const line = JSON.stringify({ batchIndex, count: batch.length, rows: batch }) + '\n';
      if (acceptGzip) {
        (out as import('zlib').Gzip).write(line);
      } else {
        res.write(line);
      }
      batchIndex++;
      batch = [];
    };

    for await (const rows of stream) {
      // rows is an array of Row objects from the SDK
      for (const row of rows as { json(): unknown }[]) {
        batch.push(row.json());
        if (batch.length >= BATCH_SIZE) flush();
      }
    }
    flush(); // last partial batch

    if (acceptGzip) {
      (out as import('zlib').Gzip).end();
    } else {
      res.end();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[catalog] query failed:', message);

    // If headers not yet sent, send JSON error
    if (!res.headersSent) {
      res.status(500).json({ error: 'ClickHouse query failed', detail: message });
    } else {
      // Stream already started — write an error sentinel line and close
      const errLine = JSON.stringify({ error: true, detail: message }) + '\n';
      if (acceptGzip) {
        (out as import('zlib').Gzip).end(errLine);
      } else {
        res.end(errLine);
      }
    }
  }
});

/** Wraps the UNION ALL query in a SELECT that filters by granularity */
function wrapWithGranularityFilter(sql: string, granularity: 'day' | 'month'): string {
  return `SELECT * FROM (\n${sql}\n) WHERE granularity = '${granularity}'`;
}

export default router;
