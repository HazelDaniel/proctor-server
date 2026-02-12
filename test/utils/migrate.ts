import { execSync } from 'node:child_process';

export function runMigrations() {
  console.log('Running migrations with DB URL:', process.env.DATABASE_URL);
  execSync('pnpm drizzle-kit migrate', { 
    stdio: 'inherit',
    env: process.env
  });
}
