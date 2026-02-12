import { Injectable, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthPayloadType } from './types';
import { UnauthenticatedError, ValidationError } from '../common/errors/domain-errors';
import { DB_PROVIDER } from '../db/db.module';
import { authTokens } from '../db/drivers/drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { sha256Hex, newToken } from '../common/crypto';
import { UsersService, normalizeEmail } from '../users/users.service';
import type { DB } from '../db/db.provider';

export type JwtUser = { userId: string };

@Injectable()
export class AuthService {
  private readonly AUTH_TOKEN_TTL_MS = 1000 * 60 * 15; // 15 minutes

  constructor(
    private readonly jwt: JwtService,
    private readonly usersService: UsersService,
    @Inject(DB_PROVIDER) private readonly db: DB,
  ) {}

  verifyToken(token: string): JwtUser {
    const payload = this.jwt.verify<AuthPayloadType>(token);
    const userId = String(payload?.sub ?? payload?.userId ?? '');
    if (!userId) throw new UnauthenticatedError('Token payload missing subject');
    return { userId };
  }

  async requestLogin(email: string) {
    const norm = normalizeEmail(email);
    const token = newToken();
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + this.AUTH_TOKEN_TTL_MS);

    await this.db.insert(authTokens).values({
      id: crypto.randomUUID(),
      email: norm,
      tokenHash,
      status: 'pending',
      expiresAt,
    });

    // NOTE: In production, we'd email this.
    return token;
  }

  async verifyLogin(email: string, token: string) {
    const norm = normalizeEmail(email);
    const tokenHash = sha256Hex(token);

    const rows = await this.db
      .select()
      .from(authTokens)
      .where(
        and(
          eq(authTokens.email, norm),
          eq(authTokens.tokenHash, tokenHash),
          eq(authTokens.status, 'pending'),
        ),
      )
      .limit(1);

    const authToken = rows[0];
    if (!authToken) throw new ValidationError('Invalid or expired login token');

    if (authToken.expiresAt.getTime() < Date.now()) {
      await this.db
        .update(authTokens)
        .set({ status: 'expired' })
        .where(eq(authTokens.id, authToken.id));
      throw new ValidationError('Login token expired');
    }

    // Mark as used
    await this.db
      .update(authTokens)
      .set({ status: 'used' })
      .where(eq(authTokens.id, authToken.id));

    // Find or create user
    const user = await this.usersService.findOrCreate(norm);

    // Issue JWT
    const jwt = this.issueToken(user.id);

    return { token: jwt, user };
  }

  issueToken(userId: string): string {
    return this.jwt.sign(
      { sub: userId, userId },
      { expiresIn: '7d' } // Long-lived session
    );
  }
}
