import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { users } from 'src/db/drivers/drizzle/schema';
import { DB_PROVIDER } from 'src/db/db.module';
import type { DB } from 'src/db/db.provider';

@Injectable()
export class UsersService {
  constructor(@Inject(DB_PROVIDER) private readonly db: DB) {}

  async getEmailById(userId: string): Promise<string | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return rows[0]?.email ?? null;
  }

  async getByEmail(email: string) {
    const norm = normalizeEmail(email);
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.email, norm))
      .limit(1);
    return rows[0] ?? null;
  }

  async findOrCreate(email: string) {
    const norm = normalizeEmail(email);
    const existing = await this.getByEmail(norm);
    if (existing) return existing;

    const id = crypto.randomUUID();
    await this.db.insert(users).values({ id, email: norm });
    return { id, email: norm };
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
