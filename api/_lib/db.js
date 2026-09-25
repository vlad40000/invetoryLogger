// Shared database connection for all API routes.
// Uses @neondatabase/serverless — no pg-native, works in Vercel Edge and Node runtimes.
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const sql = neon(process.env.DATABASE_URL);
