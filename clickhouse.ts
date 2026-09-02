import { createClient } from '@clickhouse/client';

if (!process.env.CLICKHOUSE_HOST) {
  throw new Error('CLICKHOUSE_HOST env var is required');
}

export const ch = createClient({
  url:      process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER     ?? 'default',
  password: process.env.CLICKHOUSE_PASSWORD ?? '',
  database: process.env.CLICKHOUSE_DATABASE ?? 'default',
  clickhouse_settings: {
    // Match the Metabase query's SETTINGS block
    join_algorithm:                 'grace_hash',
    max_bytes_in_join:              '10737418240',
    max_bytes_before_external_sort: '10737418240',
    max_threads:                    4,
  },
  request_timeout: 120_000, // 2-minute timeout for the heavy query
});
