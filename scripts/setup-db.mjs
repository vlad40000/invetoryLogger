#!/usr/bin/env node
// Run once to create the Neon Postgres schema.
// Usage: node scripts/setup-db.mjs
//
// Requires DATABASE_URL in environment (or .env file loaded via --env-file).
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set.');
  console.error('       Copy .env.example to .env and fill in your values.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

console.log('Running schema migration…');

await sql`
  CREATE TABLE IF NOT EXISTS docs (
    path        text PRIMARY KEY,
    parent      text NOT NULL,
    data        jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
  )
`;
console.log('  ✓ docs');

await sql`CREATE INDEX IF NOT EXISTS docs_parent_idx ON docs (parent)`;
console.log('  ✓ docs_parent_idx');

await sql`
  CREATE OR REPLACE FUNCTION jsonb_deep_merge(target jsonb, patch jsonb)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  AS \$\$
    SELECT CASE
      WHEN jsonb_typeof(target) = 'object' AND jsonb_typeof(patch) = 'object' THEN
        COALESCE((
          SELECT jsonb_object_agg(key, value)
          FROM (
            SELECT
              COALESCE(t.key, p.key) AS key,
              CASE
                WHEN t.value IS NULL THEN p.value
                WHEN p.value IS NULL THEN t.value
                ELSE jsonb_deep_merge(t.value, p.value)
              END AS value
            FROM jsonb_each(target) AS t
            FULL JOIN jsonb_each(patch) AS p USING (key)
          ) merged
        ), '{}'::jsonb)
      ELSE patch
    END
  \$\$
`;
console.log('  ✓ jsonb_deep_merge');

await sql`
  CREATE TABLE IF NOT EXISTS leases (
    path        text PRIMARY KEY,
    holder      text NOT NULL,
    expires_at  timestamptz NOT NULL
  )
`;
console.log('  ✓ leases');

await sql`
  CREATE TABLE IF NOT EXISTS assets (
    id           text PRIMARY KEY,
    url          text NOT NULL,
    pathname     text NOT NULL,
    content_type text NOT NULL,
    size_bytes   integer NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
  )
`;
console.log('  ✓ assets');

console.log('\nSchema ready.');
