import { Injectable, Inject } from '@nestjs/common';
import { eq, and, lt } from 'drizzle-orm';
import { AvatarService } from './avatar.service';

import { users } from 'src/db/drivers/drizzle/schema';
import { DB_PROVIDER } from 'src/db/db.module';
import type { DB } from 'src/db/db.provider';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB_PROVIDER) private readonly db: DB,
    private readonly avatarService: AvatarService,
  ) {}

  async getById(userId: string) {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  async getEmailById(userId: string): Promise<string | null> {
    const user = await this.getById(userId);
    return user?.email ?? null;
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

  async getByUsername(username: string) {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return rows[0] ?? null;
  }

  async findOrCreate(email: string, username?: string) {
    const norm = normalizeEmail(email);
    const existing = await this.getByEmail(norm);
    if (existing) {
      if (username && !existing.username) {
        await this.db
          .update(users)
          .set({ username })
          .where(eq(users.id, existing.id));
        return { ...existing, username };
      }
      return existing;
    }

    const id = crypto.randomUUID();
    const avatarSeed = this.avatarService.generateSeed();
    await this.db.insert(users).values({ id, email: norm, username, avatarSeed });
    return { id, email: norm, username, emailVerified: 0, avatarSeed };
  }

  async verifyEmail(userId: string) {
    await this.db
      .update(users)
      .set({ emailVerified: 1 })
      .where(eq(users.id, userId));
  }

  async updateLastLogout(userId: string) {
    await this.db
      .update(users)
      .set({ lastLogoutAt: new Date() })
      .where(eq(users.id, userId));
  }

  async deleteUnverifiedBefore(date: Date) {
    await this.db.delete(users).where(
      and(
        eq(users.emailVerified, 0),
        lt(users.createdAt, date)
      )
    );
  }
}



export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
