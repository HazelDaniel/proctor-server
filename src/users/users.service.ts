import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from 'src/db/db.provider';
import { users } from 'src/db/drivers/drizzle/schema';

@Injectable()
export class UsersService {
  async getEmailById(userId: string): Promise<string | null> {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return rows[0]?.email ?? null;
  }

  async getByEmail(email: string) {
    const norm = normalizeEmail(email);
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, norm))
      .limit(1);
    return rows[0] ?? null;
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
