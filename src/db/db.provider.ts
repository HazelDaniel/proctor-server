import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './drivers/drizzle/schema';

export let pool: Pool;
export let db: any;

export function createDb(connectionString: string) {
  pool = new Pool({ connectionString });
  db = drizzle(pool, { schema, casing: 'snake_case' });
  return db;
}

export type DB = ReturnType<typeof createDb>;
