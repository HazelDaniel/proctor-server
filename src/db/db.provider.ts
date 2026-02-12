import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './drivers/drizzle/schema';

export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema, casing: 'snake_case' });
}

export type DB = ReturnType<typeof createDb>;
