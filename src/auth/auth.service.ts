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

  async verifyToken(token: string): Promise<JwtUser> {
    const payload = this.jwt.verify<AuthPayloadType>(token);
    const userId = String(payload?.sub ?? payload?.userId ?? '');
    if (!userId) throw new UnauthenticatedError('Token payload missing subject');

    // Server-side invalidation check
    const user = await this.usersService.getById(userId);
    if (!user) throw new UnauthenticatedError('User not found');

    if (user.lastLogoutAt && payload.iat) {
      // payload.iat is in seconds, lastLogoutAt is a Date
      const issuedAtMs = payload.iat * 1000;
      if (issuedAtMs < user.lastLogoutAt.getTime()) {
        throw new UnauthenticatedError('Token invalidated by logout');
      }
    }

    return { userId };
  }


  async requestLogin(email: string, username?: string) {
    const norm = normalizeEmail(email);
    const token = newToken();
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + this.AUTH_TOKEN_TTL_MS);

    await this.db.insert(authTokens).values({
      id: crypto.randomUUID(),
      email: norm,
      username,
      tokenHash,
      status: 'pending',
      expiresAt,
    });

    // NOTE: In production, we'd email this.
    const verificationLink = `http://localhost:5173/auth/verify?token=${token}&email=${encodeURIComponent(norm)}`;
    console.log(`[AUTH] Verification link for ${email}: ${verificationLink}`);
    
    return token;
  }

  async verifyLogin(email: string, token: string, rememberMe: boolean = false) {
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
    const user = await this.usersService.findOrCreate(norm, authToken.username ?? undefined);

    // Verify email if it's the first time
    if (!user.emailVerified) {
      await this.usersService.verifyEmail(user.id);
    }

    // Issue Tokens
    const { accessToken, refreshToken } = this.issueTokens(user.id, rememberMe);

    return { token: accessToken, refreshToken, user };
  }

  issueTokens(userId: string, rememberMe: boolean = false) {
    const accessToken = this.jwt.sign(
      { sub: userId, userId },
      { expiresIn: '15m' }
    );
    const refreshToken = this.jwt.sign(
      { sub: userId, userId, isRefresh: true, rememberMe },
      { expiresIn: '7d' }
    );
    return { accessToken, refreshToken };
  }

  async refreshToken(token: string) {
    try {
      const payload = this.jwt.verify<AuthPayloadType & { isRefresh?: boolean; rememberMe?: boolean }>(token);
      if (!payload.isRefresh) throw new UnauthenticatedError('Invalid refresh token');
      
      // [todo]: only users who ticked the remember me checkbox during auth will their tokens refresh
      if (!payload.rememberMe) throw new UnauthenticatedError('Refresh disabled (remember me not selected)');

      const userId = String(payload.sub ?? payload.userId ?? '');
      if (!userId) throw new UnauthenticatedError('Token payload missing subject');

      const user = await this.usersService.getById(userId);
      if (!user) throw new UnauthenticatedError('User not found');

      return this.issueTokens(userId, true); // Keep rememberMe as true
    } catch (err: any) {
      if (err instanceof UnauthenticatedError) throw err;
      throw new UnauthenticatedError('Refresh token expired or invalid');
    }
  }

  async vacuumUnverified() {
    // Implementation for removing unverified users
    // This could be called by a cron or manually
    const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    await this.usersService.deleteUnverifiedBefore(threshold);
  }
}
